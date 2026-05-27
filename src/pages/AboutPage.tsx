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
          แพลตฟอร์มหมากรุกไทยแบบ <strong>single-player</strong> ที่ดีที่สุด —{' '}
          เล่นกับ bot ที่ฉลาด · ฝึกจากทุกตาเดิน · เทียบฝีมือกับคนอื่นผ่าน{' '}
          <em>challenge เดียวกัน</em> (bot-mediated competition)
        </p>
        <p className="about-tag-en">
          The best single-player Makruk platform: play against intelligent bots,
          learn from every move, and compete with others through shared bot challenges.
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
        <h3>โหมดการแข่ง · Bot-mediated competition</h3>
        <p>
          OpenMakruk <strong>ไม่ใช่ PvP platform</strong> — และเป็นการ
          ออกแบบ ไม่ใช่ข้อจำกัด. การแข่งทุกชั้นของระบบใช้รูปแบบที่เรียกว่า{' '}
          <em>asynchronous shared-benchmark challenge</em>:{' '}
          ทุกคนเล่นกับ bot ตัวเดียวกันภายใต้กฎเดียวกัน แล้วเทียบผลที่ได้.
        </p>
        <p className="about-section-intro">
          แนวคิดเดียวกับที่ <strong>Strava</strong> ใช้กับการวิ่ง (เทียบเวลาบน
          segment เดียวกัน), <strong>Trackmania</strong> ใช้กับ racing (race
          เทียบ ghost), หรือ <strong>Wordle</strong> ใช้กับเกมคำ (ทุกคน
          เล่นคำเดียวกันต่อวัน). เอามาประยุกต์กับหมากรุกไทย:
        </p>
        <ul className="about-bullets">
          <li>
            <strong>ไม่มี cold start</strong> — bot ออนไลน์ 24/7 ทุกระดับ
            ความเก่ง · ผู้เล่นที่ขอนแก่นตอนตี 2 เจอคู่ต่อสู้คุณภาพเท่ากับ
            ผู้เล่นที่กรุงเทพตอนเที่ยง
          </li>
          <li>
            <strong>เปรียบเทียบยุติธรรมโดยโครงสร้าง</strong> — ทุกคนเจอ
            bot ตัวเดียวกัน · ผลที่ต่างคือฝีมือต่าง ไม่ใช่ดวงในการ
            จับคู่
          </li>
          <li>
            <strong>Anti-cheat ง่ายมาก</strong> — ทุก rated game ถูก
            replay ผ่าน server engine · ท่าเดินที่ไม่ถูกกฎ reject ทันที ·
            ไม่มีผู้ร่วมมือ
          </li>
          <li>
            <strong>Social loop แบบ async</strong> — สร้าง challenge ผ่าน{' '}
            <a href="#/challenge">/#/challenge</a>, ได้ URL สั้น ๆ
            ส่งให้เพื่อนทาง LINE / Twitter · ทั้งคู่เล่นเองตามเวลาว่าง
            แล้วเทียบผล
          </li>
        </ul>
        <p className="about-section-intro">
          ใครที่อยากวิเคราะห์ตำแหน่งจาก PvP บนแพลตฟอร์มอื่นยังใช้
          ตัวพิเคราะห์ของ OpenMakruk ได้ทั้งหมดผ่านโหมด{' '}
          <strong>Custom + Library</strong> (รับ FEN ใด ๆ ก็ได้).
        </p>
      </section>

      <section className="about-section">
        <h3>ระบบคะแนน · 3 ตระกูล (3 measurement families)</h3>
        <p>
          OpenMakruk แยก "คุณเล่นดีแค่ไหน" ออกจาก "คุณชนะหรือไม่"
          อย่างชัดเจน — เพราะ training platform <strong>ต้องไม่ลงโทษ
          การแพ้ในเกมที่เล่นได้สะอาด</strong>. คะแนนจึงแบ่งเป็น 3 ตระกูล:
        </p>
        <div className="about-scoring-table">
          <div className="about-scoring-row">
            <span className="score-family-tag score-family-a-tag">A</span>
            <div>
              <strong>Performance Quality</strong> — "เล่นได้ดีแค่ไหน?"
              <p className="label-aside">
                Accuracy %, ACPL, best/good/inaccuracy/mistake/blunder,
                motif counts (capture · check · fork · mate threat)
              </p>
            </div>
          </div>
          <div className="about-scoring-row">
            <span className="score-family-tag score-family-b-tag">B</span>
            <div>
              <strong>Competitive Result</strong> — "ชนะ challenge ไหม?"
              <p className="label-aside">
                Elo rating, Match Score (ถ่วงตามความยากของคู่ต่อสู้),
                สถิติ head-to-head ของแต่ละ bot, gauntlet / tournament
              </p>
            </div>
          </div>
          <div className="about-scoring-row">
            <span className="score-family-tag score-family-c-tag">C</span>
            <div>
              <strong>Speed / Survival</strong> — "เร็วและทนแค่ไหน?"
              <p className="label-aside">
                Boss Rush best time, Puzzle Rush score, Survive rounds,
                Counting Trainer star rating
              </p>
            </div>
          </div>
        </div>
        <p className="about-section-intro">
          ทุก section ในหน้า Profile + <a href="#/stats">Stats</a> ติด tag
          A/B/C ไว้บอกว่ามาจาก family ไหน — เกมที่แพ้ด้วย accuracy 82%
          ยังได้ Family-A signal เป็นบวก. ดูภาพรวมของทั้ง 3 family ของ
          ผู้เล่นทุกคน + จำนวนผู้เล่นและ online breakdown ตามภูมิภาคที่
          หน้า <a href="#/stats">Stats สาธารณะ</a>.
        </p>
      </section>

      <section className="about-section">
        <h3>🔒 Privacy · ข้อมูลที่เก็บ</h3>
        <p>
          OpenMakruk เก็บข้อมูล <strong>เท่าที่จำเป็น</strong> และ
          แยกชั้นชัดเจน. หลักการ: ทุกอย่างทำงานในเครื่องคุณก่อน · cloud
          sync เป็น opt-in สำหรับคนที่อยากเล่นข้ามเครื่อง + ขึ้น public
          leaderboard.
        </p>
        <h4>📱 ใน browser ของคุณเท่านั้น (offline mode)</h4>
        <ul className="about-bullets">
          <li>
            <strong>Settings, rating, ประวัติเกม, badge, puzzle progress,
            cosmetics</strong> — เก็บใน <code>localStorage</code> และ
            IndexedDB ของ browser. ลบประวัติ browser = ลบทุกอย่าง
          </li>
          <li>
            <strong>NNUE network</strong> (46MB) cache ใน IndexedDB เมื่อ
            opt-in ครั้งแรก · เก็บถาวรจนกว่าจะล้าง
          </li>
          <li>
            <strong>ไม่มี cookies ติดตาม · ไม่มี ads · ไม่มี third-party
            analytics</strong> — ตรวจสอบได้จาก source code
          </li>
        </ul>

        <h4>☁️ บน server (เมื่อเปิด cloud sync เท่านั้น)</h4>
        <ul className="about-bullets">
          <li>
            <strong>Account row</strong>: random user id (UUID v4) · display
            name · province (opt-in) · rating · timestamp last_seen_at ·
            SHA-256 ของ bearer token (token จริง ๆ server ไม่มี)
          </li>
          <li>
            <strong>Games</strong>: ผลแพ้ชนะ · ตาที่เดิน (PGN-style) · rating
            ก่อน/หลัง · ทุกเกม verify ผ่าน engine ก่อน insert
          </li>
          <li>
            <strong>Badges + puzzle progress</strong>: ใช้ตัดสิน Hall of
            Fame, tier, certificates
          </li>
          <li>
            <strong>ไม่เก็บ</strong>: email · password · เบอร์โทร · IP
            address · device fingerprint · location เกินกว่า province
            ที่คุณเลือกเอง
          </li>
        </ul>
      </section>

      <section className="about-section">
        <h3>🔐 Security · model + การจัดการบัญชี</h3>
        <p>
          บัญชี OpenMakruk เป็น <strong>anonymous bearer token</strong>:
        </p>
        <ul className="about-bullets">
          <li>
            <strong>Token = กุญแจของบัญชี</strong> — ใครที่มี token นี้
            เข้าบัญชีคุณได้เต็มที่. ไม่มี password ให้ "ลืม" และไม่มี
            email ให้ reset
          </li>
          <li>
            <strong>Token อยู่ใน browser ของคุณเท่านั้น</strong> · server
            เก็บแค่ SHA-256 ของ token ลบกลับเป็น token จริงไม่ได้
          </li>
          <li>
            <strong>หา token เดิมเจอที่ Settings → "Backup token"</strong>{' '}
            · คัดลอกเก็บไว้ใน password manager / กระดาษ / cloud drive
            ส่วนตัว
          </li>
          <li>
            <strong>เข้าบัญชีบนเครื่องอื่น</strong> = Settings → "เข้าด้วย
            token" · วาง token ที่ backup ไว้
          </li>
        </ul>

        <h4>เมื่อไรควรทำอะไร</h4>
        <ul className="about-bullets">
          <li>
            <strong>ออกจากระบบบนเครื่องนี้</strong> — ลบ token จาก browser
            นี้ · device อื่นใช้ต่อได้
          </li>
          <li>
            <strong>ออกจากระบบทุกเครื่อง (rotate token)</strong> — server
            สร้าง token ใหม่ · device เดิมทุกเครื่องถูกตัดทันที · rating
            + ประวัติเกมไม่หาย. ใช้เมื่อ:
            <ul>
              <li>สงสัยว่า token หลุดออกไป (commit เข้า GitHub โดยพลาด,
                  share screen แล้วเห็น token)</li>
              <li>ลืม sign-out บน computer สาธารณะ / เครื่องเพื่อน</li>
              <li>ขายเครื่อง / ส่งซ่อม</li>
            </ul>
          </li>
          <li>
            <strong>ลบบัญชีถาวร</strong> — ลบทุกข้อมูลของ server (rating ·
            ประวัติเกม · badge · puzzle progress · season records).
            ทำซ้ำไม่ได้
          </li>
        </ul>

        <h4>คำแนะนำเรื่อง shared computer</h4>
        <p>
          ถ้าใช้คอมสาธารณะหรือเครื่องที่ไม่ใช่ของคุณเอง: หลังเล่นเสร็จ
          ให้กด <em>ออกจากระบบบนเครื่องนี้</em> ที่ Settings. ถ้าลืมและออก
          จากร้านไปแล้ว: กลับมาที่บ้าน → Settings → <em>ออกจากระบบทุกเครื่อง</em>{' '}
          (rotate token) — ตัดทุก device เดิมรวมถึงที่ร้านที่ลืมไว้ทันที.
        </p>
        <p>
          <strong>หลักการสำคัญ:</strong> มี option ครบทั้ง 3 ระดับ —
          ออกเฉพาะเครื่องนี้ / ออกทุกเครื่อง / ลบบัญชีถาวร — ตามระดับ
          ความเป็นเรื่องใหญ่. ผู้ใช้ควบคุมข้อมูลตัวเองทั้งหมด.
        </p>
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
