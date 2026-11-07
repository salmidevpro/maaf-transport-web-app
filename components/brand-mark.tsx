export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
    >
      <rect width="48" height="48" rx="12" fill="#15314C" />
      <g fill="#F7B821">
        <path d="M11 10h11v3h3v3h-3v3h-3v3h-3v-3h-5v-3h5v-3h-5z" />
        <path d="M27 10h10v3h-3v3h-3v3h-4v-3h4v-3h-4z" />
        <path d="M11 26h3v4h3v3h4v4h-3v-3h-4v-3h-3z" />
        <path d="M28 26h3v3h3v-3h3v11h-3v-5h-3v3h-3z" />
        <path d="M21 25h5v4h-3v4h-4v-4h2z" />
        <rect x="27" y="21" width="3" height="3" />
      </g>
    </svg>
  );
}
