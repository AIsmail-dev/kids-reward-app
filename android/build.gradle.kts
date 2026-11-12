plugins {
    id("com.android.application") version "9.1.0" apply false
    // Not used by the app (it has no code of its own); pins the Kotlin version the Android plugin loads.
    id("org.jetbrains.kotlin.android") version "2.4.0" apply false
}
