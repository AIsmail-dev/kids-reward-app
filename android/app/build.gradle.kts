import java.util.Properties

plugins {
    id("com.android.application")
}

// Release signing key, kept out of git (see README.md). Its SHA-256 fingerprint is listed in
// public/.well-known/assetlinks.json, which is what lets the app open the site full screen.
val keystore = Properties().apply {
    val f = rootProject.file("keystore/keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.ahmed.kidsrewards"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.ahmed.kidsrewards"
        minSdk = 24
        targetSdk = 36
        versionCode = 5
        versionName = "1.0.4"
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file("keystore/release.jks")
            storePassword = keystore.getProperty("password")
            keyAlias = "kidsrewards"
            keyPassword = keystore.getProperty("password")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

// The prayer clips the site serves from public/ are also bundled as res/raw, so
// PrayerSoundDelegationService can use them as notification sounds. (The clips that call a kid by
// name are already in src/main/res/raw.)
val prayerSoundsRes = layout.buildDirectory.dir("generated/prayerSounds/res").get().asFile
val copyPrayerSounds = tasks.register<Copy>("copyPrayerSounds") {
    from(rootProject.file("../public")) { include("*_now.mp3", "*_remind.mp3") }
    into(File(prayerSoundsRes, "raw"))
}
android.sourceSets["main"].res.srcDir(prayerSoundsRes)
tasks.named("preBuild") { dependsOn(copyPrayerSounds) }

dependencies {
    // Trusted Web Activity: shows the site in Chrome, full screen, with web push delivered as app notifications.
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
