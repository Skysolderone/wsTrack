import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/sizes";

interface SearchBarProps {
  delay?: number;
  initialValue?: string;
  onDebouncedChange: (value: string) => void;
  placeholder?: string;
}

export const SearchBar = ({
  delay = 220,
  initialValue = "",
  onDebouncedChange,
  placeholder = "搜索动作、英文名或拼音首字母",
}: SearchBarProps) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onDebouncedChange(value);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [delay, onDebouncedChange, value]);

  return (
    <View style={styles.container}>
      <Text style={styles.prefix}>搜</Text>
      <TextInput
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.primary}
        style={styles.input}
        value={value}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setValue("")}
          style={({ pressed }) => [
            styles.clearButton,
            pressed ? styles.clearButtonPressed : undefined,
          ]}
        >
          <Text style={styles.clearText}>清空</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  prefix: {
    color: colors.primarySoft,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  clearButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  clearButtonPressed: {
    opacity: 0.72,
  },
  clearText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
});
