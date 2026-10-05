/** Web downloads the same GPX locally; no file upload or Web Share API support is required. */
export async function shareGpx(
  prepare: () => { xml: string; fileName: string },
  _dialogTitle: string,
): Promise<void> {
  const { xml, fileName } = prepare();
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to take ownership of the download before releasing the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
