import build/pure/templates

pub fn export_zip(files: List(templates.ProjectFile)) -> Nil {
  export_project_zip_ffi(files)
}

@external(javascript, "../../gleam-externals/zip.mjs", "exportProjectZip")
fn export_project_zip_ffi(files: List(templates.ProjectFile)) -> Nil
