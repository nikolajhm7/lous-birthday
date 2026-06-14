import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

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
          background: "#590d22",
          borderRadius: "28px",
          color: "#fff0f3",
          fontSize: 92,
          fontWeight: 700,
        }}
      >
        🍸
      </div>
    ),
    {
      ...size,
    }
  );
}
