function format(message: string, data?: unknown): string {
  if (data === undefined) return message;
  return `${message} ${JSON.stringify(data)}`;
}

export const logger = {
  info(message: string, data?: unknown) {
    console.log(`[DiscGrade] ${format(message, data)}`);
  },
  warn(message: string, data?: unknown) {
    console.warn(`[DiscGrade] ${format(message, data)}`);
  },
  error(message: string, data?: unknown) {
    console.error(`[DiscGrade] ${format(message, data)}`);
  }
};
