import ExpoModulesCore

public class DeviceMetadataModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceMetadata")

    Events("onChange")

    Constant("PI") {
      Double.pi
    }

    Function("hello") {
      return "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }

    View(DeviceMetadataView.self) {
    }
  }
}
