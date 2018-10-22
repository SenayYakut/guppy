// @flow
import { select, call, put, take, takeEvery } from 'redux-saga/effects';
import { END } from 'redux-saga';
import { getPathForProjectId } from '../reducers/paths.reducer';
import { getNextActionForProjectId } from '../reducers/queue.reducer';
import {
  installDependencies,
  reinstallDependencies,
  uninstallDependencies,
} from '../services/dependencies.service';
import { loadProjectDependencies } from '../services/read-from-disk.service';
import { waitForAsyncRimraf } from './delete-project.saga';
import {
  ADD_DEPENDENCY,
  UPDATE_DEPENDENCY,
  DELETE_DEPENDENCY,
  INSTALL_DEPENDENCIES_START,
  REINSTALL_DEPENDENCIES_START,
  UNINSTALL_DEPENDENCIES_START,
  queueDependencyInstall,
  queueDependencyUninstall,
  installDependenciesError,
  installDependenciesFinish,
  reinstallDependenciesFinish,
  reinstallDependenciesError,
  uninstallDependenciesError,
  uninstallDependenciesFinish,
  startNextActionInQueue,
  refreshProjectsStart,
  setStatusText,
} from '../actions';

import type { Action } from 'redux';
import type { Saga } from 'redux-saga';

export function* handleAddDependency({
  projectId,
  dependencyName,
  version,
}: Action): Saga<void> {
  const queuedAction = yield select(getNextActionForProjectId, { projectId });

  yield put(queueDependencyInstall(projectId, dependencyName, version));

  // if there are no other ongoing operations, begin install
  if (!queuedAction) {
    yield put(startNextActionInQueue(projectId));
  }
}

export function* handleUpdateDependency({
  projectId,
  dependencyName,
  latestVersion,
}: Action): Saga<void> {
  const queuedAction = yield select(getNextActionForProjectId, { projectId });

  yield put(
    queueDependencyInstall(projectId, dependencyName, latestVersion, true)
  );

  if (!queuedAction) {
    yield put(startNextActionInQueue(projectId));
  }
}

export function* handleDeleteDependency({
  projectId,
  dependencyName,
}: Action): Saga<void> {
  const queuedAction = yield select(getNextActionForProjectId, { projectId });

  yield put(queueDependencyUninstall(projectId, dependencyName));

  if (!queuedAction) {
    yield put(startNextActionInQueue(projectId));
  }
}

export function* handleInstallDependenciesStart({
  projectId,
  dependencies,
}: Action): Saga<void> {
  const projectPath = yield select(getPathForProjectId, { projectId });

  try {
    yield call(installDependencies, projectPath, dependencies);
    const storedDependencies = yield call(
      loadProjectDependencies,
      projectPath,
      dependencies
    );
    yield put(installDependenciesFinish(projectId, storedDependencies));
  } catch (err) {
    yield call([console, console.error], 'Failed to install dependencies', err);
    yield put(installDependenciesError(projectId, dependencies));
  }
}

export function* handleReinstallDependenciesStart({
  projectId,
}: Action): Saga<void> {
  if (!projectId) {
    // don't trigger a reinstall if we're not having a projectId --> fail silently
    return;
  }
  const projectPath = yield select(getPathForProjectId, { projectId });
  try {
    // delete node_modules folder
    yield call(waitForAsyncRimraf, projectPath);

    // reinstall dependencies
    const channel = yield call(reinstallDependencies, projectPath);

    // eventChannel not working yet --> I'd like to display a progess on loadingSrceen.
    try {
      while (true) {
        let output = yield take.maybe(channel);
        const progress = showProgress(output.data);
        console.log('will set progress', progress, output);
        yield put(setStatusText(progress));
      }
    } catch (err) {
      console.log('error in channel handling', err);
    }

    // reinstall finished --> hide waiting spinner
    yield put(reinstallDependenciesFinish());

    yield put(refreshProjectsStart());
  } catch (err) {
    yield call(
      [console, console.error],
      'Failed to reinstall dependencies',
      err
    );
    yield put(reinstallDependenciesError(projectId));
  }
}

export function* handleUninstallDependenciesStart({
  projectId,
  dependencies,
}: Action): Saga<void> {
  const projectPath = yield select(getPathForProjectId, { projectId });

  try {
    yield call(uninstallDependencies, projectPath, dependencies);
    yield put(uninstallDependenciesFinish(projectId, dependencies));
  } catch (err) {
    yield call(
      [console, console.error],
      'Failed to uninstall dependencies',
      err
    );
    yield put(uninstallDependenciesError(projectId, dependencies));
  }
}

// helpers
export function showProgress(message: string) {
  if (!message) {
    return '';
  }

  const [text, progressStr, totalStr] = /\[(\d+)\/(\d+)\]/.exec(message);
  const progress = parseInt(progressStr);
  const total = parseInt(totalStr);

  console.log('progress', text, progress, total);
  return `Please wait. Installation Status ${(progress / total) * 100}%`;
}

// Installs/uninstalls fail silently - the only notice of a failed action
// visible to the user is either the dependency disappearing entirely or
// having its status set back to `idle`.
// TODO: display an error message outside of the console when a dependency
// action fails
export default function* rootSaga(): Saga<void> {
  yield takeEvery(ADD_DEPENDENCY, handleAddDependency);
  yield takeEvery(UPDATE_DEPENDENCY, handleUpdateDependency);
  yield takeEvery(DELETE_DEPENDENCY, handleDeleteDependency);
  yield takeEvery(INSTALL_DEPENDENCIES_START, handleInstallDependenciesStart);
  yield takeEvery(
    REINSTALL_DEPENDENCIES_START,
    handleReinstallDependenciesStart
  );
  yield takeEvery(
    UNINSTALL_DEPENDENCIES_START,
    handleUninstallDependenciesStart
  );
}
