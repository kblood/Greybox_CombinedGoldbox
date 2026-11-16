// Production gate for a Restyle viewer image (decision 142.1b). The viewer shows a verified local image,
// or, in development only, the dev fallback path. In production with no local image there is no source.
export function restyleImageSource(localUrl, fallbackUrl, isDev) {
  if (localUrl) return localUrl;
  return isDev ? fallbackUrl : null;
}
