// Export finished games to PGN (Portable Game Notation).
//
// Makruk uses the same notation system as chess — UCI/SAN works fine.
// We emit standard PGN headers including the `Variant` tag which most
// viewers (lichess analysis board, ChessTempo) honour for Makruk's
// piece movements.
//
// Move text is emitted as UCI (e.g. "e3e4") rather than SAN, because
// (1) our move history is stored in UCI already and (2) SAN for
// Makruk would need a custom serialiser since the piece letters
// differ from chess. UCI is unambiguous and viewers accept it. SAN
// export is a Phase-future enhancement.
//
// GameRecord.moves was added later — older records don't carry move
// text. For those we emit the header block and a `{ no move data }`
// note so the export still validates.

import type { GameRecord } from './stats';

type PgnExportOptions = {
  whiteName?: string;
  blackName?: string;
  site?: string;
  eventName?: string;
};

export function gameToPgn(record: GameRecord, opts: PgnExportOptions = {}): string {
  const lines: string[] = [];
  const date = new Date(record.date);
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const event = opts.eventName ?? `OpenMakruk ${record.mode === 'casual' ? 'Casual' : 'Rated'}`;
  const site = opts.site ?? 'https://openmakruk.com';
  const cpuName = `Fairy-Stockfish ${record.opponent}`;
  const white = opts.whiteName ?? (record.userSide === 'white' ? 'Player' : cpuName);
  const black = opts.blackName ?? (record.userSide === 'black' ? 'Player' : cpuName);
  const result = pgnResult(record);

  lines.push(`[Event "${event}"]`);
  lines.push(`[Site "${site}"]`);
  lines.push(`[Date "${dateStr}"]`);
  lines.push(`[Round "-"]`);
  lines.push(`[White "${white}"]`);
  lines.push(`[Black "${black}"]`);
  lines.push(`[Result "${result}"]`);
  lines.push(`[Variant "Makruk"]`);
  lines.push(`[TimeControl "${record.timeControlId ?? '-'}"]`);
  if (record.userSide === 'white') {
    lines.push(`[WhiteElo "${record.ratingBefore}"]`);
  } else {
    lines.push(`[BlackElo "${record.ratingBefore}"]`);
  }
  lines.push('');

  if (record.moves && record.moves.length > 0) {
    lines.push(`${movesToText(record.moves)} ${result}`);
  } else {
    lines.push(`{ ตาเดินไม่ถูกบันทึก (เกมเก่าก่อนเพิ่ม field moves) } ${result}`);
  }

  return lines.join('\n');
}

/** Combine multiple records into a single multi-game PGN. */
export function gamesToPgn(records: GameRecord[], opts: PgnExportOptions = {}): string {
  return records.map((r) => gameToPgn(r, opts)).join('\n\n');
}

/** Trigger a browser download of the PGN text. */
export function downloadPgn(pgn: string, filename: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function pgnResult(record: GameRecord): string {
  if (record.outcome === 'draw') return '1/2-1/2';
  if (record.outcome === 'win') {
    return record.userSide === 'white' ? '1-0' : '0-1';
  }
  // loss
  return record.userSide === 'white' ? '0-1' : '1-0';
}

function movesToText(moves: string[]): string {
  const tokens: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) tokens.push(`${i / 2 + 1}.`);
    tokens.push(moves[i]);
  }
  // Wrap at column 80
  const out: string[] = [];
  let line = '';
  for (const tok of tokens) {
    if (line.length + tok.length + 1 > 79) {
      out.push(line);
      line = tok;
    } else {
      line = line === '' ? tok : `${line} ${tok}`;
    }
  }
  if (line) out.push(line);
  return out.join('\n');
}
