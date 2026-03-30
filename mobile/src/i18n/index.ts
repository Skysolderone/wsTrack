import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { findBestLanguageTag } from "react-native-localize";

import { en } from "./en";
import { zh } from "./zh";

const detectedLanguage = findBestLanguageTag(["zh", "en"])?.languageTag === "zh" ? "zh" : "en";

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: detectedLanguage,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
