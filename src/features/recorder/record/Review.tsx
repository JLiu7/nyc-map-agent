import { useEffect, useMemo, useState } from "react";
import type { MarkKind, Recording } from "../format";
import { fitPath, walkPath } from "./path";
import { clock, recordingJson } from "./session";

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
 * each sensor gave, and Delete or Save. Save downloads two files to the
 * device, the recording JSON and the video; nothing is uploaded. A phone may
 * let only one download through per tap, so each file also has its own link.
 */
export default function Review({ take, onDelete }: { take: Take; onDelete: () => void }) {
  const [files, setFiles] = useState<Files>({ json: null, video: null, error: null });
  const [sure, setSure] = useState(false);
  const [saved, setSaved] = useState(false);
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

  const save = () => {
    if (files.json) download(files.json, take.jsonFile);
    // One after the other: two downloads started in the same instant are often cut to one.
    if (files.video && take.videoFile) {
      const { video } = files, name = take.videoFile;
      window.setTimeout(() => download(video, name), 400);
    }
    setSaved(true);
  };

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
        </div>
        {files.error && <p role="alert" className="text-sm text-red-400">{files.error}</p>}
        <div className="mt-auto flex gap-3 pt-2">
          <button type="button" data-testid="delete-button" onClick={() => (sure ? onDelete() : setSure(true))} className="min-h-12 flex-1 rounded-full border border-white/40 px-4 text-sm font-semibold">
            {sure ? "Delete for good" : "Delete"}
          </button>
          <button type="button" data-testid="save-button" onClick={save} disabled={!files.json && !files.video} className="min-h-12 flex-1 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">
            Save
          </button>
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
