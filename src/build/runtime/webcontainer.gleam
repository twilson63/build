import build/actors/webcontainer
import build/pure/templates

pub fn interpret(effect: webcontainer.Effect) -> Nil {
  case effect {
    webcontainer.BootContainer(files) -> boot_container(files)
    webcontainer.MountAndInstall(files) -> mount_and_install(files)
    webcontainer.StartDevServer -> start_dev_server()
    webcontainer.RunNpmInstall -> run_npm_install()
    webcontainer.ReadFilesFromContainer -> read_files_from_container()
  }
}

@external(javascript, "../../gleam-externals/webcontainer.mjs", "bootContainer")
fn boot_container(files: List(templates.ProjectFile)) -> Nil

@external(javascript, "../../gleam-externals/webcontainer.mjs", "mountAndInstall")
fn mount_and_install(files: List(templates.ProjectFile)) -> Nil

@external(javascript, "../../gleam-externals/webcontainer.mjs", "startDevServer")
fn start_dev_server() -> Nil

@external(javascript, "../../gleam-externals/webcontainer.mjs", "runNpmInstall")
fn run_npm_install() -> Nil

@external(javascript, "../../gleam-externals/webcontainer.mjs", "readFilesFromContainer")
fn read_files_from_container() -> Nil
