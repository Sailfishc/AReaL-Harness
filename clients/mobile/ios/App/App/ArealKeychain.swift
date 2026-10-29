import Capacitor
import Security
import UIKit

@objc(ArealKeychainPlugin)
public class ArealKeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ArealKeychainPlugin"
    public let jsName = "ArealKeychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceName", returnType: CAPPluginReturnPromise)
    ]
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "\(Bundle.main.bundleIdentifier ?? "areal.mobile").remote-device",
         kSecAttrAccount as String: "current",
         kSecAttrSynchronizable as String: false]
    }

    @objc func load(_ call: CAPPluginCall) {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Keychain read failed", "KEYCHAIN_READ", nil, ["status": status])
            return
        }
        call.resolve(["value": value])
    }

    @objc func save(_ call: CAPPluginCall) {
        guard let value = call.getString("value"),
              let data = value.data(using: .utf8), data.count <= 262144 else {
            call.reject("Invalid device record", "KEYCHAIN_RECORD")
            return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            call.reject("Keychain write failed", "KEYCHAIN_WRITE", nil, ["status": status])
            return
        }
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Keychain clear failed", "KEYCHAIN_CLEAR", nil, ["status": status])
            return
        }
        call.resolve()
    }

    @objc func deviceName(_ call: CAPPluginCall) {
        call.resolve(["name": UIDevice.current.name])
    }
}
