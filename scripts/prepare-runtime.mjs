import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, rm, chmod, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const version = process.env.DSH_JRE_VERSION || "17";
const target = process.env.DSH_JRE_TARGET || `${process.platform}-${process.arch}`;
const outputRoot = join(process.cwd(), "resources", "agent", "runtime");

// 隐式依赖模块白名单：jdeps 仅做静态分析，常漏掉反射 / SPI 服务加载所需的模块，
// 这里补充常见后端运行时必备模块，避免裁剪后启动报 NoClassDefFoundError。
// 如运行后发现缺失某模块，把模块名加进这个数组即可。
const EXTRA_MODULES = [
  "java.desktop", "java.xml", "java.sql", "java.management",
  "java.instrument", "java.naming", "java.net.http", "jdk.crypto.ec", "jdk.management",
];

const platformMap = {
  "darwin-x64": { image: "mac", arch: "x64", extension: "tar.gz" },
  "darwin-arm64": { image: "mac", arch: "aarch64", extension: "tar.gz" },
  "win32-x64": { image: "windows", arch: "x64", extension: "zip" },
  "win32-arm64": { image: "windows", arch: "aarch64", extension: "zip" },
  "linux-x64": { image: "linux", arch: "x64", extension: "tar.gz" },
  "linux-arm64": { image: "linux", arch: "aarch64", extension: "tar.gz" },
};

const platform = platformMap[target];
if (!platform) {
  throw new Error(`不支持的 JRE 目标平台：${target}。可用值：${Object.keys(platformMap).join(", ")}`);
}

// 下载 JDK（而非 JRE）：jlink 需要 jmods，且 jdeps / jlink 工具仅在 JDK 中提供。
const url = `https://api.adoptium.net/v3/binary/latest/${version}/ga/${platform.image}/${platform.arch}/jdk/hotspot/normal/eclipse?project=jdk`;
const temporaryRoot = await mkdtemp(join(tmpdir(), "dsh-jre-"));
const archive = join(temporaryRoot, `java${version}-jdk.${platform.extension}`);
const unpacked = join(temporaryRoot, "unpacked");

let javaHome;

function bin(name) {
  return join(javaHome, "bin", platform.image === "windows" ? `${name}.exe` : name);
}

async function download(file, destination) {
  const response = await fetch(file, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`下载 JDK 失败：HTTP ${response.status} ${file}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

async function extract() {
  await mkdir(unpacked, { recursive: true });
  await execFileAsync("tar", platform.extension === "zip"
    ? ["-xf", archive, "-C", unpacked]
    : ["-xzf", archive, "-C", unpacked]);
}

async function findJava(directory) {
  const javaName = platform.image === "windows" ? "java.exe" : "java";
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const candidate = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(candidate);
      } else if (entry.isFile() && entry.name === javaName) {
        return dirname(dirname(candidate));
      }
    }
  }
  throw new Error(`JDK 压缩包中未找到 ${javaName}`);
}

try {
  console.log(`下载 ${target} 的 Java ${version} JDK：${url}`);
  await download(url, archive);
  await extract();
  javaHome = await findJava(unpacked);

  const jarPath = join(process.cwd(), "resources", "agent", "dsh-java-app.jar");
  let modules = "";
  if (await access(jarPath).then(() => true).catch(() => false)) {
    const bootLib = join(temporaryRoot, "bootlib");
    await mkdir(bootLib, { recursive: true });
    // 用 JDK 自带 jar 工具抽出 BOOT-INF/lib（跨平台，避免依赖系统 unzip）
    await execFileAsync(bin("jar"), ["xf", jarPath, "BOOT-INF/lib"], { cwd: bootLib })
      .catch((e) => console.warn("抽取 BOOT-INF/lib 失败：", e.message));
    const classpath = join(bootLib, "BOOT-INF", "lib", "*");
    try {
      const { stdout } = await execFileAsync(bin("jdeps"), [
        "--ignore-missing-deps",
        "--multi-release", version,
        "-q",
        "--print-module-deps",
        "--class-path", classpath,
        jarPath,
      ], { maxBuffer: 16 * 1024 * 1024 });
      modules = stdout.toString().trim();
    } catch (e) {
      console.warn("jdeps 模块分析失败，回退到完整 JDK 运行时：", e.message);
    }
  } else {
    console.warn("未找到 dsh-java-app.jar，无法分析模块依赖，将使用完整 JDK 运行时");
  }

  const finalModules = Array.from(new Set([
    ...modules.split(",").map((m) => m.trim()).filter(Boolean),
    ...EXTRA_MODULES,
  ]));

  const runtimeOut = join(temporaryRoot, "runtime-min");
  let sourceHome = javaHome;
  if (finalModules.length > 0) {
    await execFileAsync(bin("jlink"), [
      "--add-modules", finalModules.join(","),
      "--output", runtimeOut,
      "--no-header-files",
      "--no-man-pages",
      "--strip-debug",
      "--compress", "2",
      "--bind-services",
    ]);
    sourceHome = runtimeOut;
    console.log(`已生成最小运行时，共 ${finalModules.length} 个模块（含补充白名单）`);
  } else {
    console.log("无可用模块信息，直接使用完整 JDK 运行时");
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(dirname(outputRoot), { recursive: true });
  // dereference：把 JRE 内的相对符号链接落成真实文件，避免 tauri 打包报资源不存在。
  await cp(sourceHome, outputRoot, { recursive: true, dereference: true });
  if (platform.image !== "windows") {
    await chmod(join(outputRoot, "bin", "java"), 0o755);
  }
  console.log(`Java ${version} Runtime 已准备到 ${outputRoot}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
