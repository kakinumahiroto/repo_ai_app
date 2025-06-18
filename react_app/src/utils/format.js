// 数式整形やプロンプト生成などのユーティリティ
export function formatMathInput(input) {
  if (!input) return input;
  if (/^\s*\${1,2}[\s\S]*\${1,2}\s*$/.test(input.trim())) return input;
  let replaced = input.replace(/\n?\[([\s\S]*?)\]\n?/g, (match, p1) => `\n$$\n${p1.trim()}\n$$\n`);
  const mathLike = /^[\s\d\w^+\-*/=\\()[\],.√π]+$/;
  replaced = replaced.split('\n').map(line => {
    if (/^\s*\${1,2}[\s\S]*\${1,2}\s*$/.test(line.trim())) return line;
    if ((line.match(/\$/g) || []).length >= 2) return line;
    return mathLike.test(line.trim()) ? `$${line.trim()}$` : line;
  }).join('\n');
  return replaced;
}

export function getTimeBasedGreeting() {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 0 && hour < 11) {
    return 'おはようございます';
  } else if (hour >= 11 && hour < 17) {
    return 'こんにちは';
  } else {
    return 'こんばんは';
  }
}
