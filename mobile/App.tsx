import { useEffect } from "react";
import { StatusBar, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DatabaseProvider } from "@nozbe/watermelondb/react";

import "./src/i18n";

import i18n from "./src/i18n";
import { colors } from "./src/constants/colors";
import { database } from "./src/database";
import { RootNavigator } from "./src/navigation";
import { ensureExerciseSeeded } from "./src/services/ExerciseSeedService";
import { fullSync, registerAutomaticSync } from "./src/services/SyncService";
import { ensureTemplateSeeded } from "./src/services/TemplateSeedService";
import { useAuthStore } from "./src/store/authStore";
import { useSettingsStore } from "./src/store/settingsStore";
import { useWorkoutStore } from "./src/store/workoutStore";

const App = () => {
  const language = useSettingsStore((state) => state.language);
  const accessToken = useAuthStore((state) => state.accessToken);
  const authHydrated = useAuthStore((state) => state.hasHydrated);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    void (async () => {
      await ensureExerciseSeeded(database);
      await ensureTemplateSeeded(database);
    })();
  }, []);

  useEffect(() => {
    void useWorkoutStore.getState().hydrateActiveWorkout();
  }, []);

  useEffect(() => registerAutomaticSync(), []);

  useEffect(() => {
    if (authHydrated && accessToken) {
      void fullSync();
    }
  }, [accessToken, authHydrated]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <DatabaseProvider database={database}>
          <StatusBar backgroundColor={colors.background} barStyle="light-content" />
          <RootNavigator />
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
