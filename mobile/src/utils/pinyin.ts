const pinyinBoundaries = [
  "阿",
  "芭",
  "擦",
  "搭",
  "蛾",
  "发",
  "噶",
  "哈",
  "击",
  "喀",
  "垃",
  "妈",
  "拿",
  "哦",
  "啪",
  "期",
  "然",
  "撒",
  "塌",
  "挖",
  "昔",
  "压",
  "匝",
] as const;

const pinyinInitials = "abcdefghjklmnopqrstwxyz";

const isChineseCharacter = (value: string): boolean => /[\u3400-\u9FFF]/.test(value);

export const getPinyinInitials = (input: string): string =>
  Array.from(input)
    .map((character) => {
      if (/[a-z0-9]/i.test(character)) {
        return character.toLowerCase();
      }

      if (!isChineseCharacter(character)) {
        return "";
      }

      for (let index = pinyinBoundaries.length - 1; index >= 0; index -= 1) {
        const boundary = pinyinBoundaries[index];
        if (!boundary) {
          continue;
        }

        if (character.localeCompare(boundary, "zh-CN") >= 0) {
          return pinyinInitials[index] ?? "";
        }
      }

      return "";
    })
    .join("");
