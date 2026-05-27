// ℹ️ About / Credits page.
//
// This is the public-facing place where users (and auditors) can see
// every third-party component the site is built from, with the right
// licence + author for each one. Required by the CC BY-SA terms of the
// Fulmene + Yevrowl + NNUE assets, and good open-source practice for
// the GPL engine/board libraries we depend on at runtime.

const REPO_URL = 'https://github.com/cnatthaphon/openmakruk';

type Credit = {
  name: string;
  href: string;
  author: string;
  authorHref?: string;
  license: string;
  licenseHref: string;
  role: string;
};

const PIECE_ARTWORK: Credit[] = [
  {
    name: 'Makruk piece SVGs (gradient set)',
    href: 'https://github.com/Fulmene/makruk-pieces-image',
    author: 'Fulmene',
    authorHref: 'https://github.com/Fulmene',
    license: 'CC BY-SA 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by-sa/4.0/',
    role: 'Turned-wood piece artwork (default in-game)',
  },
  {
    name: 'Makruk piece silhouettes',
    href: 'https://commons.wikimedia.org/wiki/Category:Makruk_pieces',
    author: 'Yevrowl',
    authorHref: 'https://commons.wikimedia.org/wiki/User:Yevrowl',
    license: 'CC BY-SA 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by-sa/4.0/',
    role: 'Reference silhouettes (shipped as fallback set)',
  },
  {
    name: 'Makruk NNUE network (makruk-a8c621e24a8c)',
    href: 'https://fairy-stockfish.github.io/nnue/',
    author: 'belzedar_',
    license: 'CC BY-SA 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by-sa/4.0/',
    role: 'Neural-network evaluation — +248 Elo over classical eval',
  },
];

const RUNTIME_LIBS: Credit[] = [
  {
    name: 'Fairy-Stockfish',
    href: 'https://github.com/fairy-stockfish/Fairy-Stockfish',
    author: 'Fabian Fichter & contributors',
    license: 'GPL-3.0',
    licenseHref: 'https://www.gnu.org/licenses/gpl-3.0.html',
    role: 'Chess-variant engine — Makruk rules + search',
  },
  {
    name: 'fairy-stockfish-nnue.wasm',
    href: 'https://www.npmjs.com/package/fairy-stockfish-nnue.wasm',
    author: 'Fabian Fichter',
    license: 'GPL-3.0',
    licenseHref: 'https://www.gnu.org/licenses/gpl-3.0.html',
    role: 'WebAssembly port of Fairy-Stockfish with NNUE support',
  },
  {
    name: 'ffish-es6',
    href: 'https://www.npmjs.com/package/ffish-es6',
    author: 'Fairy-Stockfish team',
    license: 'GPL-3.0',
    licenseHref: 'https://www.gnu.org/licenses/gpl-3.0.html',
    role: 'JavaScript bindings for rules / FEN / legal moves',
  },
  {
    name: 'chessground',
    href: 'https://github.com/lichess-org/chessground',
    author: 'Lichess team',
    license: 'GPL-3.0',
    licenseHref: 'https://www.gnu.org/licenses/gpl-3.0.html',
    role: 'Board UI: drag-and-drop, animation, highlights',
  },
];

const TOOLING: Credit[] = [
  {
    name: 'React',
    href: 'https://react.dev/',
    author: 'Meta',
    license: 'MIT',
    licenseHref: 'https://opensource.org/licenses/MIT',
    role: 'UI library',
  },
  {
    name: 'TypeScript',
    href: 'https://www.typescriptlang.org/',
    author: 'Microsoft',
    license: 'Apache 2.0',
    licenseHref: 'https://www.apache.org/licenses/LICENSE-2.0',
    role: 'Static typing',
  },
  {
    name: 'Vite',
    href: 'https://vitejs.dev/',
    author: 'Evan You & contributors',
    license: 'MIT',
    licenseHref: 'https://opensource.org/licenses/MIT',
    role: 'Build tool + dev server',
  },
];

export function AboutPage() {
  return (
    <div className="about-page">
      <header className="about-header">
        <h2>ℹ️ เกี่ยวกับ OpenMakruk</h2>
        <p className="about-tag">
          แพลตฟอร์ม <strong>single-player</strong> ที่ดีที่สุดสำหรับฝึก
          หมากรุกไทย · MIT licensed · ไม่มี server เก็บข้อมูลส่วนตัว
        </p>
      </header>

      <section className="about-section">
        <h3>ทำไมโปรเจกต์นี้ถึงมีอยู่</h3>
        <p>
          นานมาแล้วมีเด็กคนหนึ่งในไทยที่อยากเล่นหมากรุกไทยกับคอม
          อยากฝึก อยากเรียน — แต่หาในเน็ตเจอแต่เวอร์ชั่นโบราณที่ไม่มี
          hint, ไม่มี analysis, ไม่มี puzzle, ไม่มี learning path.
          30 ปีต่อมายังไม่มีใครทำ. โปรเจกต์นี้คือเครื่องมือที่เด็กคนนั้น
          อยากได้ — สร้างโดยเด็กคนนั้นเอง.
        </p>
        <p>
          เป้าหมาย: <strong>ฝึก single-player ครบทุกมิติ</strong> —
          22 bot characters · counting drill · pattern recognition ·
          survive defensive · boss rush · move trainer · auto-game review
          พร้อม motif breakdown — รวมกันในที่เดียว ที่ไม่มีใครในโลก
          Makruk ทำ.
        </p>
      </section>

      <section className="about-section">
        <h3>ทำไม "ไม่มี PvP" (by design)</h3>
        <p>
          PvP (Player vs Player) สด ๆ ต้องการ critical mass ของผู้เล่น
          พร้อมกัน + ทีม anti-cheat real-time + WebSocket infra =
          ใช้งบและเวลาที่ทีมเดียวคนเดียวให้ไม่ได้. เลือก
          single-player แทนเพราะ:
        </p>
        <ul className="about-bullets">
          <li>22 bot characters มี personality + lore + dynamic rating
              · "คู่ต่อสู้" จริง ๆ ไม่ใช่ AI slider</li>
          <li>Bot Exhibition cron เล่นกันเองทุก 30 นาที · feels like
              community แม้ไม่มีคน</li>
          <li>Match leaderboard · Bot Hall of Fame · Province ranking
              · Season HoF — competitive surfaces ที่ไม่ต้องรอคู่ต่อสู้</li>
          <li>Custom mode + Auto-suggest solution — ออกแบบตำแหน่ง
              ของคุณเอง · ให้คอมหา solution · แก้ได้ทั้งหมด</li>
        </ul>
      </section>

      <section className="about-section">
        <h3>ความเป็นส่วนตัว (Privacy)</h3>
        <ul className="about-bullets">
          <li>
            <strong>ไม่มี server</strong> ที่เก็บข้อมูลผู้ใช้ — เว็บนี้เป็น
            static site ทำงาน 100% บน browser ของคุณ
          </li>
          <li>
            <strong>Rating, ประวัติเกม, settings</strong> เก็บใน{' '}
            <code>localStorage</code> ของ browser เท่านั้น — Export/Import
            ได้ผ่านหน้า Profile
          </li>
          <li>
            <strong>NNUE network</strong> (46MB) ดาวน์โหลดครั้งเดียวเมื่อ
            opt-in แล้ว cache ใน IndexedDB ของ browser
          </li>
          <li>
            ไม่มี cookies ติดตาม · ไม่มี ads · ไม่มี analytics ของ third-party
          </li>
        </ul>
      </section>

      <section className="about-section">
        <h3>ฟีเจอร์</h3>
        <ul className="about-bullets">
          <li>
            เล่นกับ <strong>Fairy-Stockfish</strong> 4 ระดับ (ง่าย → ระดับมาสเตอร์)
            + NNUE optional (+248 Elo)
          </li>
          <li>
            <strong>Rated / Casual</strong> โหมด — Rated บันทึก Elo, Casual
            เปิด hint + undo
          </li>
          <li>
            <strong>Hint</strong> ระหว่างเกม + <strong>Move Review</strong>{' '}
            หลังเกม (classify: best / good / inaccuracy / mistake / blunder)
          </li>
          <li>
            <strong>Custom Position Editor</strong> ออกแบบ position ของ
            ตัวเองเพื่อสอน, สร้าง puzzle, หรือฝึก endgame
          </li>
          <li>
            <strong>Learning pathway</strong> 28 บทเรียน 6 กลุ่ม
            (ตั้งแต่กระดาน → นับศักดิ์ → endgame)
          </li>
          <li>
            <strong>กฎเฉพาะของหมากรุกไทย:</strong> นับศักดิ์ (counting rule), 3-fold
            repetition, การโปรโมตเบี้ย → เม็ด, การเดินของขุน/เม็ด/โคน
          </li>
          <li>
            <strong>Self-play autopilot</strong> + take-over + stagnation
            auto-pause
          </li>
        </ul>
      </section>

      <section className="about-section">
        <h3>เครดิตและสิทธิ์ใช้งาน (Credits & licensing)</h3>

        <h4>Piece artwork & neural network</h4>
        <CreditTable credits={PIECE_ARTWORK} />

        <h4>Runtime libraries (โหลดและรันใน browser)</h4>
        <CreditTable credits={RUNTIME_LIBS} />

        <h4>Build tooling (ใช้ตอน dev/build, ไม่ติดมากับ runtime)</h4>
        <CreditTable credits={TOOLING} />
      </section>

      <section className="about-section">
        <h3>License ของ OpenMakruk เอง</h3>
        <p>
          Source code ของ OpenMakruk เผยแพร่ภายใต้{' '}
          <a
            href="https://opensource.org/licenses/MIT"
            target="_blank"
            rel="noopener noreferrer"
          >
            MIT License
          </a>{' '}
          — copy, modify, distribute, ใช้เชิงพาณิชย์ได้ ขอแค่เก็บ copyright
          notice ไว้.
        </p>
        <p className="about-bullets-prose">
          Assets ที่ embed ในเว็บ (piece SVGs, NNUE weights) ยังเก็บ license
          เดิม (CC BY-SA 4.0) — ถ้าคุณ fork หรือใช้ asset เหล่านี้ในโปรเจกต์อื่น
          กรุณาให้เครดิต Fulmene / Yevrowl / belzedar_ ตามที่ระบุข้างบน
          และเก็บ license notice ไว้.
        </p>
        <p className="about-bullets-prose">
          Runtime libraries (Fairy-Stockfish, chessground, ffish-es6) เป็น
          GPL-3.0 — OpenMakruk โหลดจาก npm มาใช้แบบไม่ดัดแปลง (dynamic
          linking) จึงไม่ก่อให้เกิดข้อผูกพันให้ source code ของเราต้อง
          relicense.
        </p>
      </section>

      <section className="about-section">
        <h3>Source code & contributing</h3>
        <p>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            github.com/cnatthaphon/openmakruk
          </a>
          {' '}— PR, issue, feature request ยินดีต้อนรับ.
        </p>
        <p className="about-bullets-prose label-aside">
          ผู้เขียน: Natthaphon C. โปรเจกต์นี้สร้างเป็น portfolio
          piece + ของขวัญให้คอมมูนิตี้หมากรุกไทย — ไม่มีวัตถุประสงค์
          เชิงพาณิชย์.
        </p>
      </section>
    </div>
  );
}

function CreditTable({ credits }: { credits: Credit[] }) {
  return (
    <div className="credits-table">
      {credits.map((c) => (
        <div key={c.name} className="credits-row">
          <div className="credits-row-main">
            <a href={c.href} target="_blank" rel="noopener noreferrer">
              {c.name}
            </a>
            {' '}โดย{' '}
            {c.authorHref ? (
              <a href={c.authorHref} target="_blank" rel="noopener noreferrer">
                {c.author}
              </a>
            ) : (
              <span>{c.author}</span>
            )}
          </div>
          <div className="credits-row-role">{c.role}</div>
          <div className="credits-row-license">
            License:{' '}
            <a href={c.licenseHref} target="_blank" rel="noopener noreferrer">
              {c.license}
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
