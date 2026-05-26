// Per-personality strengths / weaknesses + quote, surfaced on the
// Bot Detail page so each bot reads as a character rather than a
// difficulty slider. The base Personality entry has `description` —
// short one-liner for engine selectors — but the detail page wants
// more colour ("💪 จุดเด่น", "🦴 จุดอ่อน", motto). Stored here as
// data so adding a new personality only touches two files: the
// catalog (weights + behavior) and this narrative layer.

export type PersonalityNarrative = {
  /** One-line motto / battle cry — shown big at the top of the
   *  detail page. Should sound like the bot is talking. */
  motto: string;
  /** 2-3 short Thai phrases. Each is a tactical strength a player
   *  should expect. Shown as bullet list. */
  strengths: string[];
  /** 2-3 phrases — what this personality is bad at, so the player
   *  knows how to exploit. Honest, not condescending. */
  weaknesses: string[];
  /** One-line strategic tip: how a human can beat this bot. Should
   *  reward attentive play, not memorisation. */
  howToBeat: string;
};

export const PERSONALITY_NARRATIVES: Record<string, PersonalityNarrative> = {
  attacker: {
    motto: '"ไม่บุกไม่ใช่หมากรุก"',
    strengths: [
      'combinations + tactical attack',
      'รุกฆาตเร็ว · ตา sacrifice กล้า',
      'กดดันตั้งแต่ตาที่ 5',
    ],
    weaknesses: [
      'ตำแหน่งปิด · ไม่มีช่องบุก',
      'endgame ยาว · พลังบุกหมด',
      'เสีย material แล้วงงต่อ',
    ],
    howToBeat:
      'ปิดศูนย์กลาง · trade ตัวบุก · ลากให้เข้า endgame ง่ายๆ แล้วบีบจบ',
  },
  defender: {
    motto: '"ขุนปลอดภัย · ค่อยพูดเรื่องชนะ"',
    strengths: [
      'ขุนปลอด · ไม่ตกหลุม trap',
      'รักษา structure ดี',
      'ตอบโต้แม่นเวลาโดนกดดัน',
    ],
    weaknesses: [
      'ขาด initiative · มักรออย่างเดียว',
      'มี passive piece ตัวที่ไม่ได้ใช้',
      'พลาด endgame ที่ต้อง active',
    ],
    howToBeat:
      'space advantage · บีบช่อง · บังคับให้ trade ในตำแหน่งที่ piece passive',
  },
  positional: {
    motto: '"ตำแหน่งดี · ตาผิดได้น้อย"',
    strengths: [
      'ครองศูนย์กลาง · pieces ทำงานร่วม',
      'รู้จัก outpost + weak squares',
      'พัฒนา piece เป็นรูปขบวน',
    ],
    weaknesses: [
      'tactical complications · เห็น combo ช้า',
      'ตอบโต้ sacrifice แบบไม่คาดคิด',
      'time-trouble แล้วลังเล',
    ],
    howToBeat:
      'tactic ที่ต้องคำนวณลึก · sacrifice exchange · ทำให้ position สับสน',
  },
  hunter: {
    motto: '"เห็นตัวลอย · จับทุกตัว"',
    strengths: [
      'จับตัวห้อย (hanging piece) ไว',
      'fork + skewer ออกบ่อย',
      'นับ material แม่น',
    ],
    weaknesses: [
      'โลภเกินไป · ตามจับจน position เปิด',
      'ลืม king safety',
      'ตก gambit ที่มี long-term comp',
    ],
    howToBeat:
      'gambit ล่อ · เปิดทาง diagonal ให้ Khon · sacrifice แลกกับ king attack',
  },
  wanderer: {
    motto: '"ฉันก็ไม่รู้เหมือนกัน"',
    strengths: [
      'unpredictable · ตาแปลกแหวกแนว',
      'บางทีเดินตาเก่งเกินคาด',
      'ทำให้ opponent ขาด theory',
    ],
    weaknesses: [
      'ส่วนใหญ่ตาไม่สอดคล้องกัน',
      'พลาด material บ่อย',
      'ไม่มีแผนระยะยาว',
    ],
    howToBeat:
      'เล่นแบบ solid · รอ wanderer พลาดเอง · อย่ายอม trade ในตำแหน่งที่เสียเปรียบ',
  },
  mobile: {
    motto: '"ตัวเลือกเยอะ · ตัดสินใจถูก"',
    strengths: [
      'piece activity สูง · ไม่มีตัวติด',
      'ใช้ pawn structure ที่ flexible',
      'ตอบโต้ทุกแผนได้',
    ],
    weaknesses: [
      'ตำแหน่งที่ต้องคำนวณลึก',
      'ตาเชิงรับนิ่งๆ',
      'tactic ที่ลด mobility ทันที',
    ],
    howToBeat:
      'closed center · ปิดทาง diagonal · บังคับให้ trade pieces ที่เคลื่อนไหวคล่อง',
  },
  cautious: {
    motto: '"เดินช้า · แต่ไม่พลาด"',
    strengths: [
      'แทบไม่ blunder',
      'รักษา pawn structure ดี',
      'อ่าน endgame ออกล่วงหน้า',
    ],
    weaknesses: [
      'ไม่ทำอะไรในตำแหน่งที่ต้องลุย',
      'ขาด initiative ในกลางเกม',
      'ตก attack ที่มี tempo เร็ว',
    ],
    howToBeat:
      'attack เร็ว · sharp tactics · บังคับให้ตัดสินใจในเวลาน้อย',
  },
};

export function findNarrative(personalityId: string): PersonalityNarrative | null {
  return PERSONALITY_NARRATIVES[personalityId] ?? null;
}
