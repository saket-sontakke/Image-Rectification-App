export const loadOpenCV = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).cv) {
      resolve();
    } else {
      (window as any).onOpenCvReady = () => {
        resolve();
      };
    }
  });
};