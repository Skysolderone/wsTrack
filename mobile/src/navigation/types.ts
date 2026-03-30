export type MainTabParamList = {
  Training: undefined;
  Plans: undefined;
  History: undefined;
  Analytics: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Login: undefined;
  SignUp: undefined;
  Profile: undefined;
  CoachDashboard: undefined;
  ClientDetail: {
    clientId: string;
    clientName: string;
  };
  Community: undefined;
  SharedPlanDetail: {
    sharedPlanId: string;
  };
  Challenges: undefined;
  ExerciseLibrary: undefined;
  ExerciseDetail: {
    exerciseId: string;
  };
  ExerciseAnalytics: {
    exerciseId: string;
  };
  TemplateList: undefined;
  CreateExercise:
    | {
        exerciseId?: string;
      }
    | undefined;
  PlanEditor: {
    planId: string;
  };
  ActiveWorkout: undefined;
  WorkoutDetail: {
    workoutId: string;
  };
  WorkoutSummary: {
    workoutId: string;
  };
};
