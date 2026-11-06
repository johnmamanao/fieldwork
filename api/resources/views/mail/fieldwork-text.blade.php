{!! $heading !!}

@foreach ($lines as $line)
{!! $line !!}

@endforeach
@foreach ($rows as [$label, $value])
{!! $label !!}: {!! $value !!}
@endforeach
@if ($total)
{!! $totalLabel ?? 'Total' !!}: {!! $total !!}
@endif
@if ($action)

{!! $action['label'] !!}:
{!! $action['url'] !!}
@endif
@if ($footnote)

{!! $footnote !!}
@endif

--
Fieldwork · time, invoices and payments for studios
