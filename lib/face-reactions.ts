/**
 * One-way channel from anywhere in the app to every Master Mold face on the
 * page. A window event keeps it free of React context plumbing; faces that
 * aren't mounted simply miss it.
 */
export type FaceReaction = "nod" | "shake" | "surprise" | "happy" | "annoyed";

export const FACE_REACTION_EVENT = "mastermold:face-reaction";

export function emitFaceReaction(kind: FaceReaction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FaceReaction>(FACE_REACTION_EVENT, { detail: kind }));
}

