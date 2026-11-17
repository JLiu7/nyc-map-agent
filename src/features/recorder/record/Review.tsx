import { useEffect, useMemo, useRef, useState } from "react";
import type { MarkKind, Recording } from "../format";
import { fitPath, walkPath } from "./path";
import { clock, recordingJson } from "./session";
import type { SendProgress, SendResult } from "./upload";

/** What Stop hands on: the recording and its video. */
export interface Take {
  recording: Recording;
  video: Blob | null;
  videoFile: string | null;
  jsonFile: string;
}

interface Files {
  json: string | null;
  video: string | null;
  error: string | null;
}

/** Where the Send has got to. "refused" keeps the recording on screen to send again or save. */
type Sending =
  | { at: "idle" }
  | { at: "sending"; done: number; part: "data" | "video" }
  | { at: "sent"; file: string; bytes: number }
  | { at: "refused"; why: string };

/** The phone's own store; a private tab or a full disk reads as nothing, never an error. */
const store = (): Storage | null => { try { return globalThis.localStorage; } catch { return null; } };

const MARK_LABEL: Record<MarkKind, string> = { sign: "Sign", stairs: "Stairs", elevator: "Elevator" };

function download(href: string, name: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}

/**
 * The review screen after Stop (#185): the video, the marks, how many rows
 * each sensor gave, and Delete, Send or Save (#223). Send is the one tap that
 * puts the walk on the server: its data first, then the video in parts. Save
 * downloads the two files to the device instead. Nothing goes anywhere until
 * one of them is pressed. A phone may let only one download through per tap,
 * so each file also has its own link.
 */
export default function Review({ take, onDelete }: { take: Take; onDelete: () => void }) {
  const [files, setFiles] = useState<Files>({ json: null, video: null, error: null });
  const [sure, setSure] = useState(false);
  const [saved, setSaved] = useState(false);
  // The Send's code is its own chunk (#223) and is fetched as soon as the review opens: it is not needed until Stop
  // has been pressed, so it must not sit in the recorder page's own budget. A press waits for it if it is late.
  const sendCode = useRef<Promise<typeof import("./upload")> | null>(null);
  const [sendModule, setSendModule] = useState<typeof import("./upload") | null>(null);
  useEffect(() => {
    sendCode.current ??= import("./upload");
    void sendCode.current.then(setSendModule, () => undefined);
  }, []);
  const [sending, setSending] = useState<Sending>({ at: "idle" });
  const [remaining, setRemaining] = useState<number | null>(null);
  // The links are rebuilt whenever `files` changes (a Save shows the download links). A send in flight holds
  // the bytes it took at the press, never the ones being rebuilt under it.
  const sendingNow = useRef(false);
  const rec = take.recording;

  useEffect(() => {
    let json: string | null = null;
    let error: string | null = null;
    try {
      json = URL.createObjectURL(new Blob([recordingJson(rec)], { type: "application/json" }));
    } catch (e) {
      error = e instanceof Error ? e.message : "The recording could not be written.";
    }
    const video = take.video ? URL.createObjectURL(take.video) : null;
    setFiles({ json, video, error });
    // The links stay good until Delete or leaving the page; a download can start late.
    return () => {
      if (json) URL.revokeObjectURL(json);
      if (video) URL.revokeObjectURL(video);
    };
  }, [rec, take.video]);

  // The screen's copy of the server's daily limit, once the Send's code has arrived to read it.
  useEffect(() => {
    if (sendModule) setRemaining(Math.max(0, sendModule.PER_DAY - sendModule.readCount(store(), rec.device, Date.now()).sent));
  }, [rec.device, sendModule]);

  const rows = useMemo(() => [
    ["Motion", rec.motion.length],
    ["Orientation", rec.heading.length],
    ["Location", rec.gps.length],
    ["Marks", rec.marks.length],
  ] as const, [rec]);

  const path = useMemo(() => {
    const p = walkPath(rec);
    return { ...p, drawn: fitPath(p.points, 300, 160, 16) };
  }, [rec]);

  // "3 of 14 fixes were too rough to use", or nothing when every fix was used. Short enough to be written here
  // rather than waited for with the path reader.
  const dropped = path && path.rough ? `${path.rough} of ${path.fixes} fixes were too rough to use.` : null;

  const save = () => {
    if (files.json) download(files.json, take.jsonFile);
    // One after the other: two downloads started in the same instant are often cut to one.
    if (files.video && take.videoFile) {
      const { video } = files, name = take.videoFile;
      window.setTimeout(() => download(video, name), 400);
    }
    setSaved(true);
  };

  const pressSend = async () => {
    if (sendingNow.current) return;
    // The day's limit is checked with the button, not only written under it: a screen that says "no sends left" must not send.
    if (refuse) return setSending({ at: "refused", why: `Not sent. ${refuse} The recording is still on this phone.` });
    sendingNow.current = true;
    const s = sendModule ?? (await sendCode.current!);
    setSending({ at: "sending", done: 0, part: "data" });
    // Counted here and not on the answer: the server counts a refused upload too, and a phone that loses the
    // answer mid-send would otherwise send one more than the day allows.
    setRemaining(Math.max(0, s.PER_DAY - s.addCount(store(), rec.device, Date.now()).sent));
    try {
      const result: SendResult = await s.send({
        recording: rec,
        json: recordingJson(rec),
        video: take.video,
        name: s.safeName(s.uploadName(rec.startedAt)),
        onProgress: (p: SendProgress) => setSending({ at: "sending", done: p.done, part: p.part }),
      });
      setSending(result.ok ? { at: "sent", file: result.file, bytes: result.bytes } : { at: "refused", why: result.why });
    } catch (e) {
      setSending({ at: "refused", why: `Not sent. ${e instanceof Error ? e.message : "Sending stopped."} The recording is still on this phone.` });
    } finally {
      sendingNow.current = false;
    }
  };

  /** The Send's own refusal sentence, or the limits' when they say no before anything is sent. */
  const refuse = useMemo(() => {
    if (!files.json) return "This recording could not be written, so there is nothing to send.";
    if (!sendModule) return null;
    return sendModule.checkUpload({ bytes: files.json.length + (take.video?.size ?? 0), sentToday: sendModule.PER_DAY - (remaining ?? sendModule.PER_DAY) }, { maxBytes: sendModule.MAX_BYTES, perDay: sendModule.PER_DAY });
  }, [files.json, take.video, remaining, sendModule]);

  const busy = sending.at === "sending";
  const link = "flex min-h-11 items-center justify-center rounded-full border border-white/40 px-4 text-sm font-semibold";
  return (
    <section data-testid="record-review" aria-label="Review the recording" className="absolute inset-0 z-10 overflow-y-auto bg-black">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        {files.video
          ? <video data-testid="review-video" src={files.video} controls playsInline muted className="max-h-[45vh] w-full rounded-xl bg-neutral-900" />
          : <p data-testid="review-no-video" className="rounded-xl bg-neutral-900 px-4 py-6 text-center text-sm">No video in this recording.</p>}
        <dl data-testid="review-counts" className="grid grid-cols-4 gap-2 text-center">
          {rows.map(([label, n]) => (
            <div key={label} className="rounded-xl bg-neutral-900 px-1 py-2">
              <dd data-testid={`count-${label.toLowerCase()}`} className="text-lg font-semibold tabular-nums">{n}</dd>
              <dt className="text-xs text-white/70">{label}</dt>
            </div>
          ))}
        </dl>
        {rec.motion.length === 0 && <p data-testid="review-motion-note" className="text-center text-sm text-white/80">No motion rows. Motion needs a phone.</p>}
        {rec.marks.length > 0 && (
          <ol data-testid="review-marks" className="space-y-1 text-sm">
            {rec.marks.map((m, i) => (
              <li key={i} className="flex gap-3 rounded-lg bg-neutral-900 px-3 py-2">
                <span className="tabular-nums text-white/70">{clock(m.t - rec.startedAt)}</span>
                <span>{MARK_LABEL[m.kind]}</span>
              </li>
            ))}
          </ol>
        )}
        <div data-testid="review-path" className="rounded-xl bg-neutral-900 px-3 py-3 text-sm">
          {path.why ? <p className="text-center text-white/80">{path.why}</p> : (
            <>
              <svg viewBox="0 0 300 160" role="img" aria-label="The path walked" className="w-full">
                <polyline data-testid="path-line" points={path.drawn.map((p) => p.join(",")).join(" ")} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={path.drawn[0][0]} cy={path.drawn[0][1]} r="5" fill="#fff" />
                <circle cx={path.drawn[path.drawn.length - 1][0]} cy={path.drawn[path.drawn.length - 1][1]} r="5" fill="#22c55e" stroke="#fff" strokeWidth="2" />
              </svg>
              <p data-testid="path-note" className="text-center text-white/80">{Math.round(path.lengthM)} m, from {path.points.length} location fixes. North is up.</p>
            </>
          )}
          {dropped && <p data-testid="path-dropped" className="text-center text-xs text-white/60">{dropped}</p>}
        </div>
        {files.error && <p role="alert" className="text-sm text-red-400">{files.error}</p>}
        <div className="mt-auto flex gap-3 pt-2">
          <button type="button" data-testid="delete-button" onClick={() => (sure ? onDelete() : setSure(true))} disabled={busy} className="min-h-12 flex-1 rounded-full border border-white/40 px-4 text-sm font-semibold disabled:opacity-50">
            {sure ? "Delete for good" : "Delete"}
          </button>
          <button type="button" data-testid="save-button" onClick={save} disabled={busy || (!files.json && !files.video)} className="min-h-12 flex-1 rounded-full border border-white/40 px-4 text-sm font-semibold disabled:opacity-50">
            Save
          </button>
          <button type="button" data-testid="review-send" aria-label="Send" onClick={() => void pressSend()} disabled={busy} className="min-h-12 flex-1 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">
            {busy ? "Sending" : "Send"}
          </button>
        </div>
        {/* Not a live region: the limit below it is long and would be read out on every open of the screen; the button's own state and the progress line already say what is happening. */}
        <div data-testid="send-status" className="text-center text-sm">
          {sending.at === "sending" && (
            <div className="space-y-1">
              <p>{sending.part === "data" ? "Sending the data" : "Sending the video"} {Math.round(sending.done * 100)}%</p>
              <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div data-testid="send-progress" className="h-full bg-white" style={{ width: `${Math.round(sending.done * 100)}%` }} />
              </div>
              <p className="text-white/60">Keep this screen open.</p>
            </div>
          )}
          {sending.at === "sent" && <p className="text-green-400">Sent.{sending.file ? ` ${sending.file},` : ""} {Math.round(sending.bytes / 1000)} kB.</p>}
          {sending.at === "refused" && <p className="text-red-400">{sending.why}</p>}
          {/* The limits are said before the button is pressed, not after the server refuses. */}
          {sending.at !== "sending" && refuse && <p data-testid="send-limit" className="text-white/80">{refuse}</p>}
          {sending.at === "sent" && <p className="text-white/60">{remaining} sends left today.</p>}
        </div>
        {saved && (
          <div data-testid="review-files" className="space-y-2">
            <p className="text-center text-sm text-white/80">Saved to this device. If a file is missing, tap it here.</p>
            <div className="flex gap-3">
              {files.json && <a data-testid="file-json" href={files.json} download={take.jsonFile} className={`${link} flex-1`}>Recording</a>}
              {files.video && take.videoFile && <a data-testid="file-video" href={files.video} download={take.videoFile} className={`${link} flex-1`}>Video</a>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
