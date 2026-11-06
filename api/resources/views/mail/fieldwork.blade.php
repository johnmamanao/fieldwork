@php
    // The landing hero's hours grid, as one row of cells: a fortnight of days, weekends quiet.
    $cells = ['#cf411d', '#e64d24', '#fb6a3d', '#e64d24', '#cf411d', '#982b15', '#982b15', '#e64d24', '#ff9a78', '#fb6a3d', '#fb6a3d', '#e64d24', '#982b15', '#982b15',
              '#cf411d', '#fb6a3d', '#ff9a78', '#e64d24', '#cf411d', '#982b15', '#982b15', '#e64d24', '#fb6a3d', '#ff9a78', '#fb6a3d', '#cf411d', '#982b15', '#982b15'];
    $sans = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
    $mono = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
@endphp
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{{ $mailSubject }}</title>
</head>
<body style="margin:0;padding:0;background:#f5f4f2;">
@if ($preheader)
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f4f2;">{{ $preheader }}</div>
@endif
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f4f2;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">

      <!-- header: ink bar with the wordmark -->
      <tr><td style="background:#121214;padding:16px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:22px;height:22px;background:#ffffff;" align="center" valign="middle"><div style="width:6px;height:6px;background:#f0512a;margin:8px auto;"></div></td>
          <td style="padding-left:10px;font-family:{!! $sans !!};font-size:18px;font-weight:600;letter-spacing:-0.02em;color:#ffffff;">Fieldwork</td>
        </tr></table>
      </td></tr>

      <!-- the hours strip -->
      <tr><td style="background:#b4351a;padding:8px 8px 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="2" border="0"><tr>
          @foreach ($cells as $c)<td style="height:10px;background:{{ $c }};font-size:0;line-height:0;">&nbsp;</td>@endforeach
        </tr></table>
      </td></tr>

      <!-- the card -->
      <tr><td style="background:#ffffff;padding:32px 32px 28px;border:1px solid #e6e4e1;border-top:0;">
        <h1 style="margin:0 0 12px;font-family:{!! $sans !!};font-size:24px;line-height:1.25;font-weight:500;letter-spacing:-0.02em;color:#121214;">{{ $heading }}</h1>
        @foreach ($lines as $line)
          <p style="margin:0 0 12px;font-family:{!! $sans !!};font-size:16px;line-height:1.55;color:#45464c;">{{ $line }}</p>
        @endforeach

        @if (count($rows))
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px;background:#f5f4f2;">
            @foreach ($rows as [$label, $value])
              <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #e6e4e1;font-family:{!! $sans !!};font-size:14px;color:#55565c;">{{ $label }}</td>
                <td align="right" style="padding:10px 14px;border-bottom:1px solid #e6e4e1;font-family:{!! $mono !!};font-size:14px;color:#121214;white-space:nowrap;">{{ $value }}</td>
              </tr>
            @endforeach
            @if ($total)
              <tr>
                <td style="padding:14px;font-family:{!! $mono !!};font-size:13px;letter-spacing:0.07em;text-transform:uppercase;color:#121214;">{{ $totalLabel ?? 'Total' }}</td>
                <td align="right" style="padding:14px;font-family:{!! $sans !!};font-size:22px;font-weight:600;letter-spacing:-0.02em;color:#c93d1d;white-space:nowrap;">{{ $total }}</td>
              </tr>
            @endif
          </table>
        @endif

        @if ($action)
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr>
            <td style="background:#f0512a;">
              <a href="{{ $action['url'] }}" style="display:inline-block;padding:15px 26px;font-family:{!! $mono !!};font-size:14px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:#121214;text-decoration:none;">{{ $action['label'] }}</a>
            </td>
          </tr></table>
          <p style="margin:12px 0 0;font-family:{!! $sans !!};font-size:13px;line-height:1.5;color:#7a7b82;word-break:break-all;">Or paste this link into your browser: <a href="{{ $action['url'] }}" style="color:#c93d1d;">{{ $action['url'] }}</a></p>
        @endif

        @if ($footnote)
          <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #eeecea;font-family:{!! $sans !!};font-size:13px;line-height:1.5;color:#7a7b82;">{{ $footnote }}</p>
        @endif
      </td></tr>

      <!-- footer -->
      <tr><td style="padding:20px 8px;font-family:{!! $mono !!};font-size:12px;letter-spacing:0.07em;text-transform:uppercase;color:#8b8b93;" align="center">
        Fieldwork · time, invoices and payments for studios
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
