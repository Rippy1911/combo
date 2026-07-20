import type { ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let i = 0;
  const push = (n: ReactNode) => {
    nodes.push(n);
    i += 1;
  };
  while (rest.length > 0) {
    const code = rest.match(/`([^`]+)`/);
    const bold = rest.match(/\*\*([^*]+)\*\*/);
    const ital = rest.match(/\*([^*]+)\*/);
    const link = rest.match(/\[([^\]]+)\]\(([^)]+)\)/);
    type Cand = {
      idx: number;
      len: number;
      text: string;
      kind: "code" | "bold" | "ital" | "link";
      m: RegExpMatchArray;
    };
    const candidates: Cand[] = [];
    if (code)
      candidates.push({
        idx: code.index ?? 0,
        len: code[0].length,
        text: code[1],
        kind: "code",
        m: code,
      });
    if (bold)
      candidates.push({
        idx: bold.index ?? 0,
        len: bold[0].length,
        text: bold[1],
        kind: "bold",
        m: bold,
      });
    if (ital)
      candidates.push({
        idx: ital.index ?? 0,
        len: ital[0].length,
        text: ital[1],
        kind: "ital",
        m: ital,
      });
    if (link)
      candidates.push({
        idx: link.index ?? 0,
        len: link[0].length,
        text: link[1],
        kind: "link",
        m: link,
      });
    if (candidates.length === 0) {
      push(rest);
      break;
    }
    const next = candidates.sort((a, b) => a.idx - b.idx)[0];
    if (next.idx > 0) push(rest.slice(0, next.idx));
    const k = `${keyBase}-${i}`;
    if (next.kind === "code")
      push(
        <code key={k} className="rounded bg-muted px-1 py-0.5 text-[12px]">
          {next.text}
        </code>,
      );
    else if (next.kind === "bold") push(<strong key={k}>{next.text}</strong>);
    else if (next.kind === "ital") push(<em key={k}>{next.text}</em>);
    else if (next.kind === "link") {
      const href = next.m[2] ?? "";
      const safe = /^(https?:|mailto:)/i.test(href) ? href : undefined;
      push(
        safe ? (
          <a
            key={k}
            href={safe}
            target="_blank"
            rel="noreferrer noopener"
            className="text-blue-600 underline"
          >
            {next.text}
          </a>
        ) : (
          <span key={k} className="underline decoration-dotted">
            {next.text}
          </span>
        ),
      );
    }
    rest = rest.slice(next.idx + next.len);
  }
  return nodes;
}

function table(rows: string[][], keyBase: string): ReactNode {
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  const cells = (c: string, i: number) => (
    <th key={`${keyBase}-h${i}`} className="border border-border px-2 py-1 text-left">
      {inline(c, `${keyBase}-hc${i}`)}
    </th>
  );
  const dcells = (c: string, i: number) => (
    <td key={`${keyBase}-d${i}`} className="border border-border px-2 py-1">
      {inline(c, `${keyBase}-dc${i}`)}
    </td>
  );
  return (
    <div key={keyBase} className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>{header.map(cells)}</tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional table row
            <tr key={`${keyBase}-r${ri}`}>{r.map(dcells)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const segments = text.split(/```/);
  segments.forEach((seg, si) => {
    if (si % 2 === 1) {
      const nl = seg.indexOf("\n");
      const lang = nl > 0 ? seg.slice(0, nl).trim() : "";
      const body = nl > 0 ? seg.slice(nl + 1) : seg;
      blocks.push(
        // biome-ignore lint/suspicious/noArrayIndexKey: positional code block
        <pre key={`c${si}`} className="my-2 overflow-x-auto rounded bg-muted p-2 text-[12px]">
          <code>{body.replace(/\n$/, "")}</code>
        </pre>,
      );
      void lang;
      return;
    }
    const lines = seg.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        i += 1;
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const lvl = h[1].length;
        const Tag = `h${Math.min(lvl, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        const cls = [
          "text-[15px] font-semibold mt-2",
          "text-[14px] font-semibold mt-2",
          "text-[13px] font-semibold mt-1",
          "text-[12px] font-semibold",
          "text-[12px] font-semibold",
          "text-[12px] font-semibold",
        ][lvl - 1];
        blocks.push(
          <Tag key={`h${si}-${i}`} className={cls}>
            {inline(h[2], `h${si}-${i}`)}
          </Tag>,
        );
        i += 1;
        continue;
      }
      if (/^>\s?/.test(line)) {
        const buf: string[] = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^>\s?/, ""));
          i += 1;
        }
        blocks.push(
          <blockquote
            key={`q${si}-${i}`}
            className="my-1 border-l-2 border-border pl-2 text-muted-foreground"
          >
            {inline(buf.join(" "), `q${si}-${i}`)}
          </blockquote>,
        );
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ""));
          i += 1;
        }
        blocks.push(
          <ul key={`u${si}-${i}`} className="my-1 list-disc pl-5 space-y-0.5">
            {items.map((it, ii) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional list item
              <li key={`u${si}-${i}-${ii}`}>{inline(it, `u${si}-${i}-${ii}`)}</li>
            ))}
          </ul>,
        );
        continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ""));
          i += 1;
        }
        blocks.push(
          <ol key={`o${si}-${i}`} className="my-1 list-decimal pl-5 space-y-0.5">
            {items.map((it, ii) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional list item
              <li key={`o${si}-${i}-${ii}`}>{inline(it, `o${si}-${i}-${ii}`)}</li>
            ))}
          </ol>,
        );
        continue;
      }
      if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1])) {
        const raw: string[] = [line];
        i += 2;
        while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
          raw.push(lines[i]);
          i += 1;
        }
        const rowsArr = raw.map((r) =>
          r
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim()),
        );
        blocks.push(table(rowsArr, `t${si}-${i}`));
        continue;
      }
      if (/^---+$/.test(line.trim())) {
        blocks.push(<hr key={`r${si}-${i}`} className="my-2 border-border" />);
        i += 1;
        continue;
      }
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^(#{1,6})\s|^>\s?|^[-*]\s+|^\d+\.\s+|^\|.*\|$|^---+$/.test(lines[i])
      ) {
        para.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <p key={`p${si}-${i}`} className="my-1 leading-relaxed">
          {inline(para.join(" "), `p${si}-${i}`)}
        </p>,
      );
    }
  });
  return <div className="combo-md text-[13px]">{blocks}</div>;
}
