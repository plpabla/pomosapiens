export async function readDiff(): Promise<string> {
  if (process.stdin.isTTY) {
    console.error("No diff piped on stdin. Usage: git diff | npx tsx review.ts");
    process.exit(1);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const diff = Buffer.concat(chunks).toString("utf8").trim();

  if (diff === "") {
    console.error("Empty diff received on stdin. Nothing to review.");
    process.exit(1);
  }

  return diff;
}
