# Android build environment
{
  pkgs,
  nixpkgs,
  system,
}:

let
  androidEnv = pkgs.callPackage "${nixpkgs}/pkgs/development/mobile/androidenv" {
    inherit pkgs;
    licenseAccepted = true;
  };

  includeAuto = pkgs.stdenv.hostPlatform.isx86_64 || pkgs.stdenv.hostPlatform.isDarwin;
  ndkVersion = "26.1.10909125";
  ndkVersions = [ ndkVersion ];

  sdkArgs = {
    includeNDK = true;
    includeSources = true;
    includeSystemImages = false;
    includeEmulator = false;
    inherit ndkVersions;
    useGoogleAPIs = true;
    useGoogleTVAddOns = true;
    buildToolsVersions = [ "34.0.0" ];
    numLatestPlatformVersions = 10;
    includeExtras = [
      "extras;google;gcm"
    ]
    ++ pkgs.lib.optionals includeAuto [
      "extras;google;auto"
    ];
    extraLicenses = [
      "android-sdk-preview-license"
      "android-googletv-license"
      "android-sdk-arm-dbt-license"
      "google-gdk-license"
      "intel-android-extra-license"
      "intel-android-sysimage-license"
      "mips-android-sysimage-license"
    ];
  };

  androidComposition = androidEnv.composeAndroidPackages sdkArgs;
  androidSdk = androidComposition.androidsdk;
  platformTools = androidComposition.platform-tools;
  cmake = androidComposition.cmake;
  ndkHostTag =
    if pkgs.stdenv.isLinux then
      "linux-x86_64"
    else if pkgs.stdenv.isDarwin then
      "darwin-x86_64"
    else
      "";
  ndkToolchain = "${androidSdk}/libexec/android-sdk/ndk/${ndkVersion}/toolchains/llvm/prebuilt/${ndkHostTag}";
in
{
  inherit
    androidSdk
    platformTools
    cmake
    ndkToolchain
    ndkVersion
    ;

  # List of packages required for Android development
  packages = [
    pkgs.jdk # openjdk 21
    androidSdk
    platformTools
    cmake
    pkgs.glibc_multi.dev

    # uncomment below if need 0 deps clean build. eg: nix develop .#android --store /mnt/nvme1/nix
    pkgs.git
    # pkgs.openssh
    pkgs.bash
    pkgs.patchelf  # 添加 patchelf
    pkgs.glibc
  ];

  # Provide Rust extensions/targets for use by the upper-level flake
  rust = {
    extensions = [ "rust-std" ];
    targets = [
      "aarch64-linux-android"
      "armv7-linux-androideabi"
      "i686-linux-android"
      "x86_64-linux-android"
      "wasm32-unknown-unknown"
    ];
  };

  buildInputs = [];
  # Android environment variables and shellHook
  envVars = {
    LANG = "C.UTF-8";
    LC_ALL = "C.UTF-8";
    JAVA_HOME = "${pkgs.jdk}/lib/openjdk";
    ANDROID_SDK_ROOT = "${androidSdk}/libexec/android-sdk";
    ANDROID_NDK_ROOT = "\${ANDROID_SDK_ROOT}/ndk-bundle";
    NDK_HOME = "${androidSdk}/libexec/android-sdk/ndk/${ndkVersion}";
    LIBCLANG_PATH = "${ndkToolchain}/lib";
    KCP_SYS_EXTRA_HEADER_PATH = "${ndkToolchain}/lib/clang/19/include:${pkgs.glibc_multi.dev}/include";
    ZSTD_SYS_STATIC = "1";
    BINDGEN_EXTRA_CLANG_ARGS = "--sysroot=${ndkToolchain}/sysroot -I${ndkToolchain}/lib/clang/17/include ";
    CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "${ndkToolchain}/bin/aarch64-linux-android34-clang";
    CARGO_TARGET_AARCH64_LINUX_ANDROID_AR = "${ndkToolchain}/bin/llvm-ar";
    CC_aarch64_linux_android = "${ndkToolchain}/bin/aarch64-linux-android34-clang";
    CXX_aarch64_linux_android = "${ndkToolchain}/bin/aarch64-linux-android34-clang++";
    AR_aarch64_linux_android = "${ndkToolchain}/bin/llvm-ar";

    shellHook = ''
      echo "Android environment activated"
      export GRADLE_OPTS="-Dorg.gradle.project.android.aapt2FromMavenOverride=$(echo "$ANDROID_SDK_ROOT/build-tools/"*"/aapt2")"
      cmake_root="$(echo "$ANDROID_SDK_ROOT/cmake/"*/)"
      export PATH="$cmake_root/bin:$PATH"

      unset NIX_CFLAGS_COMPILE
      unset NIX_CFLAGS_COMPILE_FOR_BUILD
      export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";

      echo "npm run dev 报错记得 patchelf --set-interpreter ${pkgs.glibc}/lib/ld-linux-x86-64.so.2 <WORKERD_PATH>"

      cat <<EOF > easytier-gui/local.properties
      sdk.dir=$ANDROID_SDK_ROOT
      ndk.dir=$ANDROID_NDK_ROOT
      cmake.dir=$cmake_root
      EOF
    '';
  };
}
