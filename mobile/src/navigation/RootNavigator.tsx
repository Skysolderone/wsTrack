import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  BarChart3,
  ClipboardList,
  Dumbbell,
  History,
  Settings2,
  type LucideIcon,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { enableScreens } from "react-native-screens";

import { colors } from "../constants/colors";
import {
  ActiveWorkoutScreen,
  AnalyticsScreen,
  ChallengesScreen,
  ClientDetailScreen,
  CoachDashboardScreen,
  CommunityScreen,
  CreateExerciseScreen,
  ExerciseAnalyticsScreen,
  ExerciseDetailScreen,
  ExerciseLibraryScreen,
  HistoryScreen,
  LoginScreen,
  PlanEditorScreen,
  PlanListScreen,
  ProfileScreen,
  SettingsScreen,
  SharedPlanDetailScreen,
  SignUpScreen,
  StartWorkoutScreen,
  TemplateListScreen,
  WorkoutDetailScreen,
  WorkoutSummaryScreen,
} from "../screens";
import { navigationRef } from "./navigationRef";
import type { MainTabParamList, RootStackParamList } from "./types";

enableScreens(true);

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    border: colors.border,
    card: colors.surface,
    notification: colors.accent,
    primary: colors.primary,
    text: colors.text,
  },
};

const tabIcons: Record<keyof MainTabParamList, LucideIcon> = {
  Training: Dumbbell,
  Plans: ClipboardList,
  History,
  Analytics: BarChart3,
  Settings: Settings2,
};

const MainTabsNavigator = () => {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          const Icon = tabIcons[route.name as keyof MainTabParamList];
          return <Icon color={color} size={size} strokeWidth={2.2} />;
        },
      })}
    >
      <Tab.Screen
        component={StartWorkoutScreen}
        name="Training"
        options={{ tabBarLabel: t("tabs.training"), tabBarButtonTestID: "tab-training" }}
      />
      <Tab.Screen
        component={PlanListScreen}
        name="Plans"
        options={{ tabBarLabel: t("tabs.plans"), tabBarButtonTestID: "tab-plans" }}
      />
      <Tab.Screen
        component={HistoryScreen}
        name="History"
        options={{ tabBarLabel: t("tabs.history"), tabBarButtonTestID: "tab-history" }}
      />
      <Tab.Screen
        component={AnalyticsScreen}
        name="Analytics"
        options={{ tabBarLabel: t("tabs.analytics"), tabBarButtonTestID: "tab-analytics" }}
      />
      <Tab.Screen
        component={SettingsScreen}
        name="Settings"
        options={{ tabBarLabel: t("tabs.settings"), tabBarButtonTestID: "tab-settings" }}
      />
    </Tab.Navigator>
  );
};

export const RootNavigator = () => (
  <NavigationContainer ref={navigationRef} theme={navigationTheme}>
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen component={MainTabsNavigator} name="MainTabs" />
      <Stack.Screen component={LoginScreen} name="Login" />
      <Stack.Screen component={SignUpScreen} name="SignUp" />
      <Stack.Screen component={ProfileScreen} name="Profile" />
      <Stack.Screen component={CoachDashboardScreen} name="CoachDashboard" />
      <Stack.Screen component={ClientDetailScreen} name="ClientDetail" />
      <Stack.Screen component={CommunityScreen} name="Community" />
      <Stack.Screen component={SharedPlanDetailScreen} name="SharedPlanDetail" />
      <Stack.Screen component={ChallengesScreen} name="Challenges" />
      <Stack.Screen component={ExerciseLibraryScreen} name="ExerciseLibrary" />
      <Stack.Screen component={ExerciseDetailScreen} name="ExerciseDetail" />
      <Stack.Screen component={ExerciseAnalyticsScreen} name="ExerciseAnalytics" />
      <Stack.Screen component={TemplateListScreen} name="TemplateList" />
      <Stack.Screen component={CreateExerciseScreen} name="CreateExercise" />
      <Stack.Screen component={PlanEditorScreen} name="PlanEditor" />
      <Stack.Screen component={ActiveWorkoutScreen} name="ActiveWorkout" />
      <Stack.Screen component={WorkoutDetailScreen} name="WorkoutDetail" />
      <Stack.Screen component={WorkoutSummaryScreen} name="WorkoutSummary" />
    </Stack.Navigator>
  </NavigationContainer>
);
