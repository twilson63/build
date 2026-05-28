import build/msg
import build/actors/project
import lustre/attribute
import lustre/element.{type Element}
import lustre/element/html
import lustre/event

pub fn view(project_name: String, save_status: String, name_editing: Bool, busy: Bool) -> Element(msg.Msg) {
  html.section(
    [attribute.class("projectControls"), attribute.aria_label("Project controls")],
    [
      html.div(
        [attribute.class("projectMeta")],
        [
          html.small([], [html.text("Project")]),
          project_name_control(project_name, name_editing),
          html.small([attribute.class("status")], [html.text(save_status)]),
        ],
      ),
      html.div(
        [attribute.class("projectToolbar")],
        [
          button([attribute.class("secondary iconButton"), attribute.title("Open projects"), attribute.aria_label("Open projects"), event.on_click(msg.Project(project.ProjectsDialogOpened))], "📁"),
          button([attribute.class("secondary iconButton"), attribute.title("New project"), attribute.aria_label("New project"), attribute.disabled(busy), event.on_click(msg.NewProject)], "＋"),
        ],
      ),
    ],
  )
}

fn project_name_control(project_name: String, name_editing: Bool) -> Element(msg.Msg) {
  case name_editing {
    True ->
      html.input([
        attribute.class("projectNameInput"),
        attribute.value(project_name),
        attribute.placeholder("Untitled Project"),
        event.on_input(fn(value) { msg.Project(project.ProjectNameChanged(value)) }),
        event.on_blur(msg.Project(project.ProjectNameEditingSet(False))),
      ])
    False ->
      html.div(
        [attribute.class("projectNameRow")],
        [
          html.strong([attribute.title(project_name)], [html.text(case project_name { "" -> "Untitled Project" _ -> project_name })]),
          button([attribute.class("ghost miniIcon"), attribute.title("Rename project"), attribute.aria_label("Rename project"), event.on_click(msg.Project(project.ProjectNameEditingSet(True)))], "✎"),
        ],
      )
  }
}

fn button(attrs, label: String) {
  html.button([attribute.type_("button"), ..attrs], [html.text(label)])
}
