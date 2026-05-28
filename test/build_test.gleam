import build_app
import gleeunit

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn gleam_prototype_title_test() {
  assert build_app.prototype_title() == "Build"
}
