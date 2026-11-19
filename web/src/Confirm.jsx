import { useRef, useState } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';

// window.confirm 대신 쓰는 확인창(Mantine 모달). const [ask, box] = useConfirm(); … if (!(await ask('글'))) return; … 화면에 {box}
export function useConfirm() {
  const [q, setQ] = useState(null);
  const res = useRef(null);
  const ask = (text, { yes = '계속', no = '취소' } = {}) => new Promise((ok) => { res.current = ok; setQ({ text, yes, no }); });
  const done = (v) => { res.current?.(v); res.current = null; setQ(null); };
  const box = (
    <Modal opened={!!q} onClose={() => done(false)} title="확인" centered>
      <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{q?.text}</Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={() => done(false)}>{q?.no}</Button>
        <Button onClick={() => done(true)} data-testid="confirm-yes">{q?.yes}</Button>
      </Group>
    </Modal>
  );
  return [ask, box];
}
