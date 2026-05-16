import Link from 'next/link';

export default function Honeypot() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      <Link href="/api/honeypot?src=layout-hidden-link" rel="nofollow">
        Hidden utility link
      </Link>
    </div>
  );
}
