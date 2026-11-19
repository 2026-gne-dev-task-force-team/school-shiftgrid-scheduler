import { useState } from 'react';
import { Popover, Text } from '@mantine/core';
import { GLOSSARY } from './glossary.js';

// 낱말에 점선 밑줄 — 마우스를 올리거나 누르면(폰) 풀이가 뜬다. 풀이가 없는 k 는 글자만 그대로 낸다.
export default function Term({ k, children }) {
  const [hover, setHover] = useState(false);
  const [pin, setPin] = useState(false);
  const text = GLOSSARY[k];
  if (!text) return <>{children ?? k}</>;
  return (
    <Popover opened={hover || pin} onChange={(o) => { if (!o) { setPin(false); setHover(false); } }} width={260} withArrow shadow="md" position="bottom" withinPortal>
      <Popover.Target>
        <span role="button" tabIndex={0} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          onClick={() => setPin((p) => !p)} onKeyDown={(e) => { if (e.key === 'Enter') setPin((p) => !p); }}
          style={{ borderBottom: '1px dotted currentColor', cursor: 'help' }}>{children ?? k}</span>
      </Popover.Target>
      <Popover.Dropdown><Text size="sm" fw={600}>{k}</Text><Text size="sm">{text}</Text></Popover.Dropdown>
    </Popover>
  );
}
