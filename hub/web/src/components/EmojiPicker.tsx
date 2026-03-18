import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import EmojiPickerReact, { type EmojiClickData, Theme } from "emoji-picker-react";

interface Props {
  value?: string;
  onSelect(emoji: string): void;
}

export default function EmojiPicker({ value, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="text-xl w-9 h-9 flex items-center justify-center rounded border hover:border-primary transition-colors shrink-0"
        title="Pick emoji"
      >
        {value && !value.startsWith("ms:") ? value : "😀"}
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-100%)", zIndex: 9999 }}
        >
          <EmojiPickerReact
            theme={Theme.LIGHT}
            onEmojiClick={(data: EmojiClickData) => {
              onSelect(data.emoji);
              setOpen(false);
            }}
            lazyLoadEmojis
            allowExpandReactions={false}
          />
        </div>,
        document.body
      )}
    </>
  );
}
