export const LARGE_FILE_CHAR_THRESHOLD = 1_500_000;
export const LANGUAGE_SERVICE_FILE_CHAR_LIMIT = 512 * 1024;

export function isLargeFileContent(content: string): boolean {
  return content.length > LARGE_FILE_CHAR_THRESHOLD;
}

export function formatCharacterCount(characters: number): string {
  if (characters >= 1024 * 1024) {
    return `${(characters / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (characters >= 1024) {
    return `${(characters / 1024).toFixed(1)} KB`;
  }
  return `${characters} chars`;
}
