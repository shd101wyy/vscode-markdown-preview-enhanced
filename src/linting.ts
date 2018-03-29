// @ts-ignore
import { VFile, VFileBase } from "vfile";
import * as reporter from "vfile-reporter";

export const updateLintingReport = (vFiles: Array<VFile<{}>> = []) => {
  // tslint:disable-next-line:no-console
  console.log(reporter(vFiles));
};
