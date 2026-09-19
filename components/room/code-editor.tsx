"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WrapText } from "lucide-react";
import { Button } from "@/components/ui/button";

const WRAP_STORAGE_KEY = "code-share-wrap";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  toolbarStart?: React.ReactNode;
  toolbarEnd?: React.ReactNode;
};

export function CodeEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "Paste your code here",
  toolbarStart,
  toolbarEnd
}: CodeEditorProps) {
  const [isWrapEnabled, setIsWrapEnabled] = useState(false);
  const [wrappedLineHeights, setWrappedLineHeights] = useState<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);

  const codeLines = useMemo(() => value.split("\n"), [value]);

  useEffect(() => {
    setIsWrapEnabled(window.localStorage.getItem(WRAP_STORAGE_KEY) === "on");
  }, []);

  // The gutter is a separate element, so wrapped lines only stay aligned with
  // their numbers if every number row is as tall as the line it belongs to.
  // The hidden mirror below renders the same text at the same width, which
  // gives us the rendered height of each logical line.
  const measureWrappedLines = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;

    if (!textarea || !mirror) {
      return;
    }

    mirror.style.width = `${textarea.clientWidth}px`;
    const heights = Array.from(
      mirror.children,
      (child) => (child as HTMLElement).getBoundingClientRect().height
    );

    setWrappedLineHeights((previous) =>
      previous.length === heights.length &&
      previous.every((height, index) => height === heights[index])
        ? previous
        : heights
    );
  }, []);

  useEffect(() => {
    if (!isWrapEnabled) {
      setWrappedLineHeights([]);
      return;
    }

    measureWrappedLines();

    const textarea = textareaRef.current;

    if (!textarea || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => measureWrappedLines());
    observer.observe(textarea);

    return () => observer.disconnect();
  }, [value, isWrapEnabled, measureWrappedLines]);

  const syncGutterScroll = () => {
    if (!textareaRef.current || !gutterRef.current) {
      return;
    }

    gutterRef.current.scrollTop = textareaRef.current.scrollTop;
  };

  const toggleWrap = () => {
    const nextWrap = !isWrapEnabled;
    setIsWrapEnabled(nextWrap);
    window.localStorage.setItem(WRAP_STORAGE_KEY, nextWrap ? "on" : "off");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
        <div className="flex flex-wrap items-center gap-2">
          {toolbarStart}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={toggleWrap}
            className="rounded-full"
            aria-pressed={isWrapEnabled}
            title="Toggle word wrap"
          >
            <WrapText className="size-4" />
            {isWrapEnabled ? "Wrap on" : "Wrap off"}
          </Button>
        </div>

        {toolbarEnd ? (
          <div className="flex items-center gap-3">{toolbarEnd}</div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] bg-[var(--editor)]">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="h-full overflow-hidden border-r border-[var(--border)] bg-black/4 px-2.5 py-3 text-right font-mono text-[0.95rem] leading-7 text-[var(--muted)] select-none"
        >
          {codeLines.map((_, index) => (
            <div
              key={index}
              style={
                isWrapEnabled && wrappedLineHeights[index]
                  ? { height: wrappedLineHeights[index] }
                  : undefined
              }
            >
              {index + 1}
            </div>
          ))}
        </div>

        <div className="relative min-w-0">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onScroll={syncGutterScroll}
            spellCheck={false}
            disabled={disabled}
            placeholder={placeholder}
            wrap={isWrapEnabled ? "soft" : "off"}
            className={`h-full w-full resize-none overflow-auto border-0 bg-[var(--editor)] px-4 py-3 font-mono text-[0.95rem] leading-7 text-[var(--foreground)] outline-none disabled:opacity-60 ${
              isWrapEnabled ? "break-words whitespace-pre-wrap" : "whitespace-pre"
            }`}
          />

          {isWrapEnabled ? (
            <div
              ref={mirrorRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute top-0 left-0 break-words whitespace-pre-wrap px-4 py-3 font-mono text-[0.95rem] leading-7"
            >
              {codeLines.map((line, index) => (
                <div key={index}>{line === "" ? "​" : line}</div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
