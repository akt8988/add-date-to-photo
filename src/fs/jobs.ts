import { isSupportedImage } from "../stamp/imageKinds";

export type JobFile = {
  name: string;
  relativePath: string;
  getFile: () => Promise<File>;
};

export function jobsFromFiles(fileList: File[]): JobFile[] {
  return fileList.filter(isSupportedImage).map((file) => ({
    name: file.name,
    relativePath: file.name,
    getFile: () => Promise.resolve(file),
  }));
}
