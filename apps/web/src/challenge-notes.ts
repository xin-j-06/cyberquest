export interface SavedChallengeNote {
  id: string;
  slug: string;
  challengeTitle: string;
  category: string;
  content: string;
  createdAt?: string;
  updatedAt: string;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function indexKey(userId: string) {
  return `cq_challenge_notes_${safeId(userId)}`;
}

export function challengeNoteKey(userId: string, slug: string) {
  return `cq_challenge_note_${safeId(userId)}_${safeId(slug)}`;
}

export function loadChallengeNotes(userId: string): SavedChallengeNote[] {
  if (!userId) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(indexKey(userId)) ?? '{}') as Record<string, SavedChallengeNote>;
    return Object.values(parsed)
      .filter((item) => item?.content?.trim())
      .map((item, index) => ({ ...item, id: item.id || `legacy-${safeId(item.slug)}-${safeId(item.updatedAt || String(index))}` }))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  } catch {
    return [];
  }
}

export function loadChallengeNote(userId: string, slug: string) {
  if (!userId) return undefined;
  const indexed = loadChallengeNotes(userId).find((item) => item.slug === slug);
  return indexed;
}

export function cacheChallengeNote(userId: string, note: SavedChallengeNote) {
  if (!userId) return undefined;
  let current: Record<string, SavedChallengeNote> = {};
  try { current = JSON.parse(localStorage.getItem(indexKey(userId)) ?? '{}'); } catch { current = {}; }

  if (note.content.trim()) current[note.id] = note;
  else delete current[note.id];

  localStorage.setItem(indexKey(userId), JSON.stringify(current));
  localStorage.setItem(challengeNoteKey(userId, note.slug), note.content);
  return note;
}

export function saveChallengeNoteCache(userId: string, note: Omit<SavedChallengeNote, 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  return cacheChallengeNote(userId, { ...note, id: note.id || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: now, updatedAt: now });
}

export function replaceChallengeNoteCache(userId: string, notes: SavedChallengeNote[]) {
  if (!userId) return;
  const indexed = Object.fromEntries(notes.map((note) => [note.id, note]));
  localStorage.setItem(indexKey(userId), JSON.stringify(indexed));
}

export function removeChallengeNoteCache(userId: string, noteId: string) {
  if (!userId) return;
  const notes = loadChallengeNotes(userId).filter((note) => note.id !== noteId);
  replaceChallengeNoteCache(userId, notes);
}
