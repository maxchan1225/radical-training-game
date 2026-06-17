/**
 * 二次根式數學引擎 (Quadratic Radicals Math Engine)
 * 用於隨機生成八年級適合的二次根式題目與標準答案。
 */

// 求最大公因數
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

// 化簡分數，回傳 [分子, 分母]
export function simplifyFraction(num: number, den: number): [number, number] {
  const divisor = gcd(num, den);
  let n = num / divisor;
  let d = den / divisor;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  return [n, d];
}

// 將 \sqrt{n} 化簡為 k\sqrt{p} 的形式，其中 p 不含平方因數
export function simplifyRadical(n: number): { k: number; p: number } {
  if (n <= 0) return { k: 0, p: 0 };
  let k = 1;
  let p = n;
  
  // 從最大的可能平方根開始向下搜尋
  const maxSquareRoot = Math.floor(Math.sqrt(n));
  for (let i = maxSquareRoot; i >= 2; i--) {
    const square = i * i;
    if (p % square === 0) {
      k *= i;
      p /= square;
    }
  }
  return { k, p };
}

// 將係數 k 和根號內 p 轉化為字串 (例如 k=2, p=3 => "2√3")
export function formatRadicalString(k: number, p: number): string {
  if (k === 0) return "0";
  if (p === 1) return `${k}`;
  if (k === 1) return `√${p}`;
  if (k === -1) return `-√${p}`;
  return `${k}√${p}`;
}

export interface Question {
  type: number;           // 1 to 6
  typeName: string;       // 題型名稱
  questionDisplay: {      // 用於 HTML 顯示的結構
    prefix?: string;      // 例如 "化簡："
    radical?: {           // 是否為根式結構
      inside: string;     // 根號內部字串
      coefficient?: string; // 根式外的係數
      under?: string;     // 分數的分母 (若是分數根式)
    };
    fraction?: {          // 是否為普通分數結構
      num: string;        // 分子
      den: string;        // 分母
    };
    rawText: string;      // 純文字備份，例如 "√72" 或 "6/√2"
  };
  correctAnswer: string;  // 用於比對的標準答案，例如 "6√2", "2", "3/4", "√2/2"
  correctAnswerDisplay: string; // 適合人看的答案顯示，例如 "6√2" 或 "3/4"
  tips: string;           // 幸運卡提示
}

// 產生隨機質數
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23];
// 產生無平方因子的數 (p)
const FREE_SQUARES = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15];

export function generateQuestion(type: number): Question {
  let typeName = "";
  let questionDisplay: Question["questionDisplay"] = { rawText: "" };
  let correctAnswer = "";
  let correctAnswerDisplay = "";
  let tips = "";

  switch (type) {
    case 1: {
      typeName = "開平方";
      const isFraction = Math.random() < 0.5;
      if (!isFraction) {
        // 整數開平方
        const x = Math.floor(Math.random() * 14) + 2; // 2 ~ 15
        const sq = x * x;
        questionDisplay = {
          prefix: "求值：",
          radical: { inside: `${sq}` },
          rawText: `√${sq}`
        };
        correctAnswer = `${x}`;
        correctAnswerDisplay = `${x}`;
        tips = `提示：找出哪一個正數的平方等於 ${sq}。即 \\(x^2 = ${sq}\\)。`;
      } else {
        // 分數開平方
        const x = Math.floor(Math.random() * 8) + 1;  // 1 ~ 8
        let y = Math.floor(Math.random() * 8) + 2;  // 2 ~ 9
        while (y <= x || gcd(x, y) !== 1) {
          y = Math.floor(Math.random() * 8) + 3;
        }
        const sqNum = x * x;
        const sqDen = y * y;
        questionDisplay = {
          prefix: "求值：",
          radical: { inside: `${sqNum}`, under: `${sqDen}` },
          rawText: `√(${sqNum}/${sqDen})`
        };
        correctAnswer = `${x}/${y}`;
        correctAnswerDisplay = `${x}/${y}`;
        tips = `提示：分子和分母分別開平方，即 \\(\\sqrt{\\frac{a}{b}} = \\frac{\\sqrt{a}}{\\sqrt{b}}\\)。`;
      }
      break;
    }

    case 2: {
      typeName = "平方計算";
      const subType = Math.floor(Math.random() * 3); // 3種子類型
      if (subType === 0) {
        // (\sqrt{p})^2
        const p = PRIMES[Math.floor(Math.random() * PRIMES.length)];
        questionDisplay = {
          prefix: "計算：",
          rawText: `(√${p})²`
        };
        correctAnswer = `${p}`;
        correctAnswerDisplay = `${p}`;
        tips = `提示：根據定義，對於任意非負數 a，有 \\((\\sqrt{a})^2 = a\\)。`;
      } else if (subType === 1) {
        // (k\sqrt{p})^2
        const k = Math.floor(Math.random() * 4) + 2; // 2 ~ 5
        const p = PRIMES[Math.floor(Math.random() * 4)]; // 2, 3, 5, 7
        questionDisplay = {
          prefix: "計算：",
          rawText: `(${k}√${p})²`
        };
        const ansVal = k * k * p;
        correctAnswer = `${ansVal}`;
        correctAnswerDisplay = `${ansVal}`;
        tips = `提示：\\((a\\sqrt{b})^2 = a^2 \\times (\\sqrt{b})^2 = a^2 \\times b\\)。`;
      } else {
        // (-k\sqrt{p})^2
        const k = Math.floor(Math.random() * 3) + 2; // 2 ~ 4
        const p = PRIMES[Math.floor(Math.random() * 4)];
        questionDisplay = {
          prefix: "計算：",
          rawText: `(-${k}√${p})²`
        };
        const ansVal = k * k * p;
        correctAnswer = `${ansVal}`;
        correctAnswerDisplay = `${ansVal}`;
        tips = `提示：負數的平方是正數，即 \\((-x)^2 = x^2\\)。再應用乘方性質。`;
      }
      break;
    }

    case 3: {
      typeName = "根式乘法";
      const withCoeff = Math.random() < 0.5;
      if (!withCoeff) {
        // \sqrt{a} \times \sqrt{b}
        const a = Math.floor(Math.random() * 10) + 2; // 2 ~ 11
        const b = Math.floor(Math.random() * 10) + 2; // 2 ~ 11
        questionDisplay = {
          prefix: "計算：",
          rawText: `√${a} × √${b}`
        };
        const prod = a * b;
        const rad = simplifyRadical(prod);
        correctAnswer = formatRadicalString(rad.k, rad.p);
        correctAnswerDisplay = correctAnswer;
        tips = `提示：根式相乘，根號內的數相乘：\\(\\sqrt{a} \\times \\sqrt{b} = \\sqrt{a \\times b}\\)。最後別忘了化簡根式。`;
      } else {
        // c\sqrt{a} \times d\sqrt{b}
        const c = Math.floor(Math.random() * 3) + 2; // 2 ~ 4
        const d = Math.floor(Math.random() * 3) + 2; // 2 ~ 4
        const a = Math.floor(Math.random() * 6) + 2; // 2 ~ 7
        const b = Math.floor(Math.random() * 6) + 2; // 2 ~ 7
        questionDisplay = {
          prefix: "計算：",
          rawText: `${c}√${a} × ${d}√${b}`
        };
        const outside = c * d;
        const inside = a * b;
        const rad = simplifyRadical(inside);
        const finalOutside = outside * rad.k;
        correctAnswer = formatRadicalString(finalOutside, rad.p);
        correctAnswerDisplay = correctAnswer;
        tips = `提示：係數相乘作為外係數，根號內的數相乘：\\(c\\sqrt{a} \\times d\\sqrt{b} = (c \\times d)\\sqrt{a \\times b}\\)。`;
      }
      break;
    }

    case 4: {
      typeName = "根式化簡";
      const k = Math.floor(Math.random() * 5) + 2; // 2 ~ 6
      const p = FREE_SQUARES[Math.floor(Math.random() * 5)]; // 2, 3, 5, 6, 7
      const inside = k * k * p;
      questionDisplay = {
        prefix: "化簡：",
        radical: { inside: `${inside}` },
        rawText: `√${inside}`
      };
      correctAnswer = formatRadicalString(k, p);
      correctAnswerDisplay = correctAnswer;
      tips = `提示：將被開方數因數分解，找出完全平方數因數移到根號外，例如 \\(\\sqrt{12} = \\sqrt{4 \\times 3} = 2\\sqrt{3}\\)。`;
      break;
    }

    case 5: {
      typeName = "根式加減";
      const isSimple = Math.random() < 0.5;
      const p = FREE_SQUARES[Math.floor(Math.random() * 3)]; // 2, 3, 5
      
      if (isSimple) {
        // a\sqrt{p} \pm b\sqrt{p}
        const a = Math.floor(Math.random() * 7) + 3; // 3 ~ 9
        const b = Math.floor(Math.random() * 6) + 1; // 1 ~ 6
        const isAdd = Math.random() < 0.5;
        const op = isAdd ? "+" : "-";
        
        questionDisplay = {
          prefix: "計算：",
          rawText: `${a}√${p} ${op} ${b}√${p}`
        };
        
        const finalOutside = isAdd ? (a + b) : (a - b);
        correctAnswer = formatRadicalString(finalOutside, p);
        correctAnswerDisplay = correctAnswer;
        tips = `提示：同類二次根式（根號內相同的根式）可以合併，係數相加減。如 \\(a\\sqrt{x} + b\\sqrt{x} = (a+b)\\sqrt{x}\\)。`;
      } else {
        // \sqrt{a^2 * p} \pm \sqrt{b^2 * p}
        const a = Math.floor(Math.random() * 3) + 2; // 2 ~ 4
        let b = Math.floor(Math.random() * 3) + 1;  // 1 ~ 3
        if (a === b) b = a + 1;
        const isAdd = Math.random() < 0.5;
        const op = isAdd ? "+" : "-";
        
        const insideA = a * a * p;
        const insideB = b * b * p;
        
        questionDisplay = {
          prefix: "計算：",
          rawText: `√${insideA} ${op} √${insideB}`
        };
        
        const finalOutside = isAdd ? (a + b) : (a - b);
        correctAnswer = formatRadicalString(finalOutside, p);
        correctAnswerDisplay = correctAnswer;
        tips = `提示：先將每個根式化為最簡二次根式（如 \\(\\sqrt{${insideA}} = ${a}\\sqrt{${p}}\\)），再將同類二次根式合併。`;
      }
      break;
    }

    case 6: {
      typeName = "分母有理化";
      const subType = Math.floor(Math.random() * 3);
      if (subType === 0) {
        // a / \sqrt{b}
        const b = [2, 3, 5, 7][Math.floor(Math.random() * 4)];
        let a = Math.floor(Math.random() * 5) + 1; // 1 ~ 5
        // 確保 a 不會太大，如果是 b 的倍數，化簡完是整數倍根式
        const num = a;
        questionDisplay = {
          prefix: "化簡：",
          fraction: { num: `${num}`, den: `√${b}` },
          rawText: `${num}/√${b}`
        };
        
        // 有理化： (num * \sqrt{b}) / b
        const [n, d] = simplifyFraction(num, b);
        if (d === 1) {
          // 整數倍
          correctAnswer = formatRadicalString(n, b);
        } else {
          // 分數形式，格式為 "n√b/d" (如 "3√2/2" 或 "√2/2" (n=1))
          const outsideStr = n === 1 ? "" : n === -1 ? "-" : `${n}`;
          correctAnswer = `${outsideStr}√${b}/${d}`;
        }
        correctAnswerDisplay = d === 1 ? correctAnswer : `${n}√${b}/${d}`;
        tips = `提示：分子分母同乘以分母的根式 \\(\\sqrt{${b}}\\)，使分母化為有理數。`;
      } else if (subType === 1) {
        // 1 / \sqrt{b}
        const b = [2, 3, 5, 6][Math.floor(Math.random() * 4)];
        questionDisplay = {
          prefix: "化簡：",
          fraction: { num: "1", den: `√${b}` },
          rawText: `1/√${b}`
        };
        correctAnswer = `√${b}/${b}`;
        correctAnswerDisplay = `√${b}/${b}`;
        tips = `提示：分子分母同乘 \\(\\sqrt{${b}}\\)，分母變為 ${b}，分子變為 \\(\\sqrt{${b}}\\)。`;
      } else {
        // a / (c\sqrt{b})
        const b = [2, 3, 5][Math.floor(Math.random() * 3)];
        const c = Math.floor(Math.random() * 2) + 2; // 2 ~ 3
        const a = Math.floor(Math.random() * 3) + 1; // 1 ~ 3
        // 題目： a / (c√b)
        questionDisplay = {
          prefix: "化簡：",
          fraction: { num: `${a}`, den: `${c}√${b}` },
          rawText: `${a}/(${c}√${b})`
        };
        
        // 有理化： (a * \sqrt{b}) / (c * b)
        const denVal = c * b;
        const [n, d] = simplifyFraction(a, denVal);
        const outsideStr = n === 1 ? "" : n === -1 ? "-" : `${n}`;
        correctAnswer = `${outsideStr}√${b}/${d}`;
        correctAnswerDisplay = `${n}√${b}/${d}`;
        tips = `提示：分子分母同乘以 \\(\\sqrt{${b}}\\)，分母變為 ${c} \\times ${b} = ${denVal}。最後化簡分數。`;
      }
      break;
    }
  }

  return {
    type,
    typeName,
    questionDisplay,
    correctAnswer,
    correctAnswerDisplay,
    tips
  };
}

/**
 * 標準化學生的答案輸入，方便做比對。
 * 例如：將學生的 "1√3" 轉成 "√3"，"3/6" 轉成 "1/2"，去除所有空格，
 * 將中文的根號 ｢√｣ 與標準符號等同，轉換分數線等。
 */
export function normalizeAnswer(ans: string): string {
  if (!ans) return "";
  let s = ans.trim().replace(/\s+/g, ""); // 去除空格
  
  // 替換中文除號或分數號為 /
  s = s.replace(/分之/g, "/"); // 支持中文輸入習慣（若有的話）
  
  // 替換 1√p 為 √p，-1√p 為 -√p
  s = s.replace(/^1√/g, "√");
  s = s.replace(/^-1√/g, "-√");
  
  // 處理分數化簡？如果標準答案是化簡好的，學生的答案也要化簡才能過。
  // 我們可以讓學生輸入最簡形式，如果學生輸入未化簡分數，例如 "2/4"，是否給對？
  // 按照數學規範，需要最簡。所以我們比對的是化簡後的字串。
  return s;
}

/**
 * 驗證學生答案是否正確
 */
export function checkAnswer(studentAns: string, correctAns: string): boolean {
  const normStudent = normalizeAnswer(studentAns);
  const normCorrect = normalizeAnswer(correctAns);
  
  if (normStudent === normCorrect) return true;
  
  // 容錯機制：如果標準答案是 "√2/2"，學生輸入 "1√2/2" 也算對
  // 如果標準答案是 "2√3"，學生輸入 "2*√3" 也算對
  const altStudent = normStudent.replace(/\*/g, "");
  const altCorrect = normCorrect.replace(/\*/g, "");
  
  return altStudent === altCorrect;
}
