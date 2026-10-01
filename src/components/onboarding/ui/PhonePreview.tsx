interface PhonePreviewProps {
  sender: string;
  message: string;
}

/** iPhone-style frame showing a received text message. */
export default function PhonePreview({ sender, message }: PhonePreviewProps) {
  return (
    <div
      className="mx-auto w-full max-w-[260px] rounded-[2.5rem] border-[10px] border-stone-900 bg-stone-900 shadow-xl"
      role="img"
      aria-label={`Text message from ${sender}: ${message}`}
    >
      <div className="relative overflow-hidden rounded-[1.9rem] bg-white">
        <div className="absolute top-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-stone-900" />
        <div className="flex flex-col items-center gap-1 border-b border-stone-100 bg-stone-50 px-4 pt-10 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-300 text-sm font-semibold text-white">
            {sender.charAt(0).toUpperCase()}
          </div>
          <p className="max-w-full truncate text-[11px] font-medium text-stone-700">{sender}</p>
        </div>
        <div className="min-h-[280px] px-3 py-4">
          <p className="mb-2 text-center text-[10px] text-stone-400">Today 10:45 AM</p>
          <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-stone-100 px-3 py-2 text-[12px] leading-snug whitespace-pre-wrap text-stone-900">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
