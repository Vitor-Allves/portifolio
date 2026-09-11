type LogoProps = {
  variant?: "light" | "dark";
  className?: string;
};

export default function Logo({ variant = "light", className = "" }: LogoProps) {
  const ink = variant === "light" ? "#F8F9FB" : "#0A1526";
  const accent = "#BFC3C9";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="1"
          width="32"
          height="32"
          rx="2"
          stroke={accent}
          strokeWidth="1"
        />
        <path d="M17 5 L29 17 L17 29 L5 17 Z" stroke={accent} strokeWidth="1" />
        <path
          d="M11 21.5V11.5H13.4V19.4H18.2V21.5H11Z"
          fill={ink}
          stroke={ink}
          strokeWidth="0.4"
        />
      </svg>
      <span
        className="font-serif tracking-[0.2em] uppercase text-sm sm:text-base"
        style={{ color: ink }}
      >
        Legado <span className="opacity-70">Enterprise</span>
      </span>
    </div>
  );
}
