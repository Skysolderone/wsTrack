import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";

interface NumericKeypadProps {
  allowDecimal?: boolean;
  leftShortcuts: number[];
  onClose: () => void;
  onConfirm: (value: number | null) => void;
  previousValue: number | null;
  rightShortcuts: number[];
  title: string;
  unitLabel?: string;
  value: number | null;
  visible: boolean;
}

const keypadRows = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

const formatValue = (value: number | null): string => {
  if (value === null) {
    return "";
  }

  return `${value}`;
};

const parseValue = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

export const NumericKeypad = ({
  allowDecimal = true,
  leftShortcuts,
  onClose,
  onConfirm,
  previousValue,
  rightShortcuts,
  title,
  unitLabel,
  value,
  visible,
}: NumericKeypadProps) => {
  const [draft, setDraft] = useState(formatValue(value));

  useEffect(() => {
    if (visible) {
      setDraft(formatValue(value));
    }
  }, [value, visible]);

  const displayValue = useMemo(() => (draft ? draft : "0"), [draft]);

  const appendCharacter = (character: string) => {
    setDraft((current) => {
      if (character === "." && (!allowDecimal || current.includes("."))) {
        return current;
      }

      if (!current && character === ".") {
        return "0.";
      }

      return `${current}${character}`;
    });
  };

  const applyDelta = (delta: number) => {
    setDraft((current) => {
      const nextValue = Math.max(0, (parseValue(current) ?? 0) + delta);
      return Number.isInteger(nextValue) ? `${nextValue}` : nextValue.toFixed(2);
    });
  };

  const handleConfirm = () => {
    onConfirm(parseValue(draft));
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.reference}>
                上次参考: {previousValue !== null ? `${previousValue}${unitLabel ?? ""}` : "--"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.confirmButton,
                pressed ? styles.confirmButtonPressed : undefined,
              ]}
            >
              <Text style={styles.confirmText}>确认</Text>
            </Pressable>
          </View>

          <View style={styles.valueCard}>
            <Text style={styles.valueText}>
              {displayValue}
              {unitLabel ?? ""}
            </Text>
          </View>

          <View style={styles.keypadRow}>
            <View style={styles.shortcutColumn}>
              {leftShortcuts.map((valueItem) => (
                <Pressable
                  key={`left-${valueItem}`}
                  accessibilityRole="button"
                  onPress={() => applyDelta(valueItem)}
                  style={({ pressed }) => [
                    styles.shortcutButton,
                    pressed ? styles.shortcutButtonPressed : undefined,
                  ]}
                >
                  <Text style={styles.shortcutText}>{valueItem > 0 ? `+${valueItem}` : valueItem}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.centerColumn}>
              {keypadRows.map((row) => (
                <View key={row.join("-")} style={styles.numberRow}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      onPress={() => appendCharacter(key)}
                      style={({ pressed }) => [
                        styles.keyButton,
                        pressed ? styles.keyButtonPressed : undefined,
                      ]}
                    >
                      <Text style={styles.keyText}>{key}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}

              <View style={styles.numberRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (allowDecimal ? appendCharacter(".") : setDraft(""))}
                  style={({ pressed }) => [
                    styles.keyButton,
                    pressed ? styles.keyButtonPressed : undefined,
                  ]}
                >
                  <Text style={allowDecimal ? styles.keyText : styles.keySubtleText}>
                    {allowDecimal ? "." : "清空"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => appendCharacter("0")}
                  style={({ pressed }) => [
                    styles.keyButton,
                    pressed ? styles.keyButtonPressed : undefined,
                  ]}
                >
                  <Text style={styles.keyText}>0</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDraft((current) => current.slice(0, -1))}
                  style={({ pressed }) => [
                    styles.keyButton,
                    pressed ? styles.keyButtonPressed : undefined,
                  ]}
                >
                  <Text style={styles.keyText}>⌫</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.shortcutColumn}>
              {rightShortcuts.map((valueItem) => (
                <Pressable
                  key={`right-${valueItem}`}
                  accessibilityRole="button"
                  onPress={() => applyDelta(valueItem)}
                  style={({ pressed }) => [
                    styles.shortcutButton,
                    pressed ? styles.shortcutButtonPressed : undefined,
                  ]}
                >
                  <Text style={styles.shortcutText}>{valueItem > 0 ? `+${valueItem}` : valueItem}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.backgroundElevated,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.md,
    padding: spacing.lg,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  reference: {
    color: colors.textMuted,
    fontSize: 13,
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: "center",
    minWidth: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  confirmButtonPressed: {
    opacity: 0.8,
  },
  confirmText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  valueCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: spacing.lg,
  },
  valueText: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "800",
  },
  keypadRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  shortcutColumn: {
    gap: spacing.sm,
    justifyContent: "space-between",
    width: 68,
  },
  shortcutButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 72,
    paddingHorizontal: spacing.xs,
  },
  shortcutButtonPressed: {
    opacity: 0.78,
  },
  shortcutText: {
    color: colors.primarySoft,
    fontSize: 18,
    fontWeight: "800",
  },
  centerColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  numberRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  keyButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 72,
  },
  keyButtonPressed: {
    opacity: 0.82,
  },
  keyText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  keySubtleText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: "700",
  },
});
