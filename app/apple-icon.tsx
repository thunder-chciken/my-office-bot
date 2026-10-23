import { ImageResponse } from "next/og";

// iOS ignores SVG icons for "Add to Home Screen", so render a PNG.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4DA8FF, #0A6CFF)",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 512 512">
          <path
            d="M282 96 150 284h96l-16 132 132-188h-96z"
            fill="#fff"
            stroke="#fff"
            strokeWidth="18"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}
