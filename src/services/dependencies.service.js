// @flow
import { eventChannel, END } from 'redux-saga';
import { PACKAGE_MANAGER_CMD } from './platform.service';
import { processLogger } from './process-logger.service';
import * as childProcess from 'child_process';

import type { QueuedDependency } from '../types';
import type { Channel } from 'redux-saga';

const spawnProcess = (
  cmd: string,
  cmdArgs: string[],
  projectPath: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    const output = {
      stdout: '',
      stderr: '',
    };
    const child = childProcess.spawn(cmd, cmdArgs, {
      cwd: projectPath,
    });

    child.stdout.on('data', data => (output.stdout += data.toString()));
    child.stderr.on('data', data => (output.stderr += data.toString()));
    child.on(
      'exit',
      code => (code ? reject(output.stderr) : resolve(output.stdout))
    );
    processLogger(child, 'DEPENDENCY');
  });

export const spawnProcessChannel = (
  cmd: string,
  cmdArgs: string[],
  projectPath: string
) => {
  return eventChannel(emitter => {
    const output = {
      stdout: '',
      stderr: '',
    };
    let child = childProcess.spawn(cmd, cmdArgs, {
      cwd: projectPath,
    });

    processLogger(child, 'DEPENDENCY');

    child.stdout.on('data', data => {
      output.stdout += data.toString();
      emitter(data.toString());
    });
    // todo also emit errors --> maybe by emitting an object
    child.stderr.on('data', data => {
      output.stderr += data.toString();
      emitter(data.toString());
    });

    child.on('exit', code => {
      emitter(code ? output.stderr : output.stdout);
      emitter(END);
      // return code ? reject(output.stderr) : resolve(output.stdout);
    });

    // The subscriber must return an unsubscribe function
    return () => {};
  });
};

export const getDependencyInstallationCommand = (
  dependencies: Array<QueuedDependency>
): Array<string> => {
  const versionedDependencies = dependencies.map(
    ({ name, version }) => name + (version ? `@${version}` : '')
  );

  return ['add', ...versionedDependencies, '-SE'];
};

export const installDependencies = (
  projectPath: string,
  dependencies: Array<QueuedDependency>
) =>
  spawnProcess(
    PACKAGE_MANAGER_CMD,
    getDependencyInstallationCommand(dependencies),
    projectPath
  );

export const uninstallDependencies = (
  projectPath: string,
  dependencies: Array<QueuedDependency>
) =>
  spawnProcess(
    PACKAGE_MANAGER_CMD,
    ['remove', ...dependencies.map(({ name }) => name)],
    projectPath
  );

export const reinstallDependencies = (projectPath: string) =>
  spawnProcess(PACKAGE_MANAGER_CMD, ['install'], projectPath);
