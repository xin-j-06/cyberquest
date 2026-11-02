import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface ChallengeAttachmentMeta {
  id: string;
  name: string;
  label: string;
  kind: string;
  mediaType: string;
  size: number;
  url: string;
}

export interface ChallengeAttachmentFile extends ChallengeAttachmentMeta {
  path: string;
}

type AttachmentDefinition = Omit<ChallengeAttachmentMeta, 'size' | 'url'>;

const definitions: Record<string, AttachmentDefinition[]> = {
  'crypto-101': [
    { id: 'crypto-encoded-message', name: 'encoded-message.txt', label: '双层编码样本', kind: 'TEXT', mediaType: 'text/plain; charset=utf-8' },
  ],
  'network-101': [
    { id: 'network-traffic-summary', name: 'traffic-summary.csv', label: '合成流量摘要', kind: 'CSV', mediaType: 'text/csv; charset=utf-8' },
  ],
  'reverse-101': [
    { id: 'reverse-strings', name: 'sample.strings.txt', label: '示例程序字符串清单', kind: 'TEXT', mediaType: 'text/plain; charset=utf-8' },
  ],
  'pwn-101': [
    { id: 'pwn-source-review', name: 'length-check.c', label: '边界检查代码样本', kind: 'C SOURCE', mediaType: 'text/x-c; charset=utf-8' },
  ],
};

function filePath(challengeSlug: string, name: string) {
  return join(__dirname, '..', '..', 'assets', 'challenges', challengeSlug, name);
}

export function challengeAttachments(challengeSlug: string): ChallengeAttachmentMeta[] {
  return (definitions[challengeSlug] ?? []).flatMap((item) => {
    const path = filePath(challengeSlug, item.name);
    if (!existsSync(path)) return [];
    return [{ ...item, size: statSync(path).size, url: `/challenges/${encodeURIComponent(challengeSlug)}/attachments/${encodeURIComponent(item.name)}` }];
  });
}

export function challengeAttachment(challengeSlug: string, requestedName: string): ChallengeAttachmentFile | undefined {
  const definition = (definitions[challengeSlug] ?? []).find((item) => item.name === requestedName);
  if (!definition) return undefined;
  const path = filePath(challengeSlug, definition.name);
  if (!existsSync(path)) return undefined;
  return { ...definition, path, size: statSync(path).size, url: `/challenges/${encodeURIComponent(challengeSlug)}/attachments/${encodeURIComponent(definition.name)}` };
}

export function attachmentCount() {
  return Object.keys(definitions).reduce((total, challengeSlug) => total + challengeAttachments(challengeSlug).length, 0);
}
