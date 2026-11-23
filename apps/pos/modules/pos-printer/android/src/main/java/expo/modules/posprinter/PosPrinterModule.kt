package expo.modules.posprinter

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.util.UUID

private const val USB_PERMISSION = "expo.modules.posprinter.USB_PERMISSION"
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

class PrinterException(message: String) : CodedException(message)

/**
 * Finds receipt printers the tablet can reach (same Wi-Fi network, paired Bluetooth, USB) and sends
 * raw ESC/POS bytes to one of them.
 */
class PosPrinterModule : Module() {
  private val context: Context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PosPrinter")

    /** Wi-Fi / LAN: every address on the tablet's /24 network that accepts a connection on `port` (9100 = raw printing). */
    AsyncFunction("scanNetwork") Coroutine { port: Int, timeoutMs: Int ->
      scanNetwork(port, timeoutMs)
    }

    /** Bluetooth: devices already paired in Android settings, printers first. */
    AsyncFunction("bluetoothDevices") { bluetoothDevices() }

    /** USB: connected devices that can receive data (bulk OUT), printers first. */
    AsyncFunction("usbDevices") { usbDevices() }

    /** Asks Android for permission to use a USB device; resolves true when allowed. */
    AsyncFunction("requestUsbPermission") { deviceName: String, promise: Promise ->
      requestUsbPermission(deviceName, promise)
    }

    /** Sends base64-encoded bytes. kind: "network" (address = IP or IP:port), "bluetooth" (MAC), "usb" (device name). */
    AsyncFunction("print") Coroutine { kind: String, address: String, base64: String ->
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      withContext(Dispatchers.IO) {
        when (kind) {
          "network" -> printNetwork(address, bytes)
          "bluetooth" -> printBluetooth(address, bytes)
          "usb" -> printUsb(address, bytes)
          else -> throw PrinterException("Unknown printer connection: $kind")
        }
      }
      true
    }
  }

  // ───────────────────────────── Wi-Fi / LAN
  private fun localIPv4(): Inet4Address? =
    NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
      .filter { it.isUp && !it.isLoopback }
      .sortedBy { if (it.name.startsWith("wlan")) 0 else if (it.name.startsWith("eth")) 1 else 2 }
      .flatMap { it.inetAddresses.toList() }
      .filterIsInstance<Inet4Address>()
      .firstOrNull { it.isSiteLocalAddress }

  private suspend fun scanNetwork(port: Int, timeoutMs: Int): List<Map<String, Any>> = coroutineScope {
    val me = localIPv4() ?: return@coroutineScope emptyList()
    val parts = me.hostAddress!!.split(".")
    val prefix = "${parts[0]}.${parts[1]}.${parts[2]}."
    val gate = Semaphore(48)
    (1..254).filter { "$prefix$it" != me.hostAddress }.map { host ->
      async(Dispatchers.IO) {
        gate.withPermit {
          val ip = "$prefix$host"
          try {
            Socket().use { s -> s.connect(InetSocketAddress(ip, port), timeoutMs); ip }
          } catch (_: Exception) { null }
        }
      }
    }.awaitAll().filterNotNull().map { ip ->
      mapOf("kind" to "network", "address" to if (port == 9100) ip else "$ip:$port", "name" to "Network printer", "detail" to ip, "isPrinter" to true)
    }
  }

  private fun printNetwork(address: String, bytes: ByteArray) {
    val host = address.substringBefore(":")
    val port = address.substringAfter(":", "9100").toIntOrNull() ?: 9100
    Socket().use { s ->
      s.connect(InetSocketAddress(host, port), 5000)
      s.getOutputStream().apply { write(bytes); flush() }
      Thread.sleep(200)
    }
  }

  // ───────────────────────────── Bluetooth
  private fun hasBluetoothPermission() =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

  @SuppressLint("MissingPermission")
  private fun bluetoothDevices(): List<Map<String, Any>> {
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter ?: return emptyList()
    if (!hasBluetoothPermission()) throw PrinterException("BLUETOOTH_PERMISSION")
    if (!adapter.isEnabled) throw PrinterException("BLUETOOTH_OFF")
    return adapter.bondedDevices.orEmpty().map { d ->
      val printer = d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING
      mapOf("kind" to "bluetooth", "address" to d.address, "name" to (d.name ?: d.address), "detail" to d.address, "isPrinter" to printer)
    }.sortedByDescending { it["isPrinter"] as Boolean }
  }

  @SuppressLint("MissingPermission")
  private fun printBluetooth(address: String, bytes: ByteArray) {
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      ?: throw PrinterException("This tablet has no Bluetooth.")
    if (!hasBluetoothPermission()) throw PrinterException("BLUETOOTH_PERMISSION")
    adapter.cancelDiscovery()
    val device = adapter.getRemoteDevice(address)
    // Many cheap thermal printers refuse the standard secure connection; try the usual fallbacks.
    val attempts: List<() -> BluetoothSocket> = listOf(
      { device.createRfcommSocketToServiceRecord(SPP_UUID) },
      { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) },
      { device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType).invoke(device, 1) as BluetoothSocket },
    )
    var last: Exception? = null
    for (make in attempts) {
      val s = try { make() } catch (e: Exception) { last = e; continue }
      try {
        s.connect()
        val out = s.outputStream
        // Small chunks: the printer's buffer is tiny and drops data sent all at once.
        var off = 0
        while (off < bytes.size) {
          val n = minOf(512, bytes.size - off)
          out.write(bytes, off, n); out.flush()
          off += n
          Thread.sleep(25)
        }
        Thread.sleep(maxOf(800L, bytes.size / 20L)) // let it finish printing before hanging up
        s.close()
        return
      } catch (e: Exception) {
        last = e
        try { s.close() } catch (_: Exception) {}
        Thread.sleep(300)
      }
    }
    throw PrinterException("BLUETOOTH_CONNECT: ${last?.message ?: "no answer"}")
  }

  // ───────────────────────────── USB
  private val usb: UsbManager get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

  private fun bulkOut(d: UsbDevice): Pair<UsbInterface, UsbEndpoint>? {
    for (i in 0 until d.interfaceCount) {
      val itf = d.getInterface(i)
      for (e in 0 until itf.endpointCount) {
        val ep = itf.getEndpoint(e)
        if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.direction == UsbConstants.USB_DIR_OUT) return itf to ep
      }
    }
    return null
  }

  private fun usbDevices(): List<Map<String, Any>> =
    usb.deviceList.values.mapNotNull { d ->
      val (itf, _) = bulkOut(d) ?: return@mapNotNull null
      val printer = itf.interfaceClass == UsbConstants.USB_CLASS_PRINTER
      mapOf("kind" to "usb", "address" to d.deviceName, "name" to (d.productName ?: d.manufacturerName ?: "USB device"),
        "detail" to "USB ${"%04x".format(d.vendorId)}:${"%04x".format(d.productId)}", "isPrinter" to printer)
    }.sortedByDescending { it["isPrinter"] as Boolean }

  private fun requestUsbPermission(deviceName: String, promise: Promise) {
    val device = usb.deviceList[deviceName] ?: return promise.reject(PrinterException("The USB printer is not connected."))
    if (usb.hasPermission(device)) return promise.resolve(true)
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        if (intent.action != USB_PERMISSION) return
        try { context.unregisterReceiver(this) } catch (_: Exception) {}
        promise.resolve(intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false))
      }
    }
    ContextCompat.registerReceiver(context, receiver, IntentFilter(USB_PERMISSION), ContextCompat.RECEIVER_NOT_EXPORTED)
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    val intent = PendingIntent.getBroadcast(context, 0, Intent(USB_PERMISSION).setPackage(context.packageName), flags)
    usb.requestPermission(device, intent)
  }

  private fun printUsb(deviceName: String, bytes: ByteArray) {
    val device = usb.deviceList[deviceName] ?: throw PrinterException("The USB printer is not connected.")
    if (!usb.hasPermission(device)) throw PrinterException("USB_PERMISSION")
    val (itf, ep) = bulkOut(device) ?: throw PrinterException("This USB device can't receive print jobs.")
    val conn = usb.openDevice(device) ?: throw PrinterException("Couldn't open the USB printer.")
    try {
      conn.claimInterface(itf, true)
      var off = 0
      while (off < bytes.size) {
        val n = minOf(16384, bytes.size - off)
        val sent = conn.bulkTransfer(ep, bytes, off, n, 5000)
        if (sent < 0) throw PrinterException("The USB printer stopped responding.")
        off += sent
      }
      conn.releaseInterface(itf)
    } finally { conn.close() }
  }
}
