export async function presignedDownload({
  key,
  expiresIn,
}: {
  key: string;
  expiresIn: number;
}): Promise<string> {
  void expiresIn;
  return key;
}
