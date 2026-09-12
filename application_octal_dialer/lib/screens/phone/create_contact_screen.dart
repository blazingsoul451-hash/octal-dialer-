import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../widgets/octal_logo.dart';
import '../../models/phone_models.dart';
import '../../services/phone_data_service.dart';

class CreateContactScreen extends StatefulWidget {
  final String initialPhoneNumber;

  const CreateContactScreen({
    super.key,
    this.initialPhoneNumber = '',
  });

  @override
  State<CreateContactScreen> createState() => _CreateContactScreenState();
}

class _CreateContactScreenState extends State<CreateContactScreen> {
  // Primary basic fields
  final TextEditingController _firstNameController = TextEditingController();
  final TextEditingController _surnameController = TextEditingController();
  final TextEditingController _companyController = TextEditingController();
  final TextEditingController _notesController = TextEditingController();

  // Dynamic phones
  final List<TextEditingController> _phoneControllers = [];
  final List<String> _phoneLabels = [];

  // Dynamic emails
  final List<TextEditingController> _emailControllers = [];
  final List<String> _emailLabels = [];

  // Dynamic addresses
  final List<TextEditingController> _addressControllers = [];
  final List<String> _addressLabels = [];

  // Dynamic Birthday / Significant date
  bool _hasSignificantDate = false;
  DateTime _significantDate = DateTime(2026, 9, 12);
  bool _includeYear = true;
  String _significantDateType = 'Birthday';

  // Dynamic labels
  final List<String> _selectedLabels = [];
  final List<String> _availableLabels = ['ICE'];

  // Additional custom fields (from "Other" bottom sheet)
  final Map<String, TextEditingController> _additionalFields = {};

  bool _isFavorite = false;

  @override
  void initState() {
    super.initState();
    // Initialize first phone field
    _phoneControllers.add(TextEditingController(text: widget.initialPhoneNumber));
    _phoneLabels.add('Mobile');
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _surnameController.dispose();
    _companyController.dispose();
    _notesController.dispose();
    for (var c in _phoneControllers) {
      c.dispose();
    }
    for (var c in _emailControllers) {
      c.dispose();
    }
    for (var c in _addressControllers) {
      c.dispose();
    }
    for (var c in _additionalFields.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _handleSave() {
    final firstName = _firstNameController.text.trim();
    final surname = _surnameController.text.trim();
    final primaryPhone = _phoneControllers.isNotEmpty ? _phoneControllers.first.text.trim() : '';

    if (firstName.isEmpty && primaryPhone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter at least a name or phone number')),
      );
      return;
    }

    final fullName = [firstName, surname].where((s) => s.isNotEmpty).join(' ');
    final effectiveName = fullName.isNotEmpty ? fullName : primaryPhone;

    final newContact = PhoneContact(
      id: 'contact_${DateTime.now().millisecondsSinceEpoch}',
      name: effectiveName,
      number: primaryPhone,
      isFavorite: _isFavorite,
    );

    // Save to PhoneDataService
    PhoneDataService.instance.contacts.insert(0, newContact);

    HapticFeedback.mediumImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Contact "$effectiveName" saved'),
        backgroundColor: const Color(0xFF28231F),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );

    Navigator.pop(context, newContact);
  }

  // ─── ADD / REMOVE HELPERS ──────────────────────────────────────────────────

  void _addPhone() {
    setState(() {
      _phoneControllers.add(TextEditingController());
      _phoneLabels.add('Mobile');
    });
  }

  void _removePhone(int index) {
    if (_phoneControllers.length <= 1) {
      _phoneControllers[0].clear();
      setState(() {});
    } else {
      setState(() {
        _phoneControllers[index].dispose();
        _phoneControllers.removeAt(index);
        _phoneLabels.removeAt(index);
      });
    }
  }

  void _addEmail() {
    setState(() {
      _emailControllers.add(TextEditingController());
      _emailLabels.add('Home');
    });
  }

  void _removeEmail(int index) {
    setState(() {
      _emailControllers[index].dispose();
      _emailControllers.removeAt(index);
      _emailLabels.removeAt(index);
    });
  }

  void _addAddress() {
    setState(() {
      _addressControllers.add(TextEditingController());
      _addressLabels.add('Home');
    });
  }

  void _removeAddress(int index) {
    setState(() {
      _addressControllers[index].dispose();
      _addressControllers.removeAt(index);
      _addressLabels.removeAt(index);
    });
  }

  void _removeSignificantDate() {
    setState(() {
      _hasSignificantDate = false;
    });
  }

  void _removeLabel(String label) {
    setState(() {
      _selectedLabels.remove(label);
    });
  }

  void _removeAdditionalField(String key) {
    setState(() {
      _additionalFields[key]?.dispose();
      _additionalFields.remove(key);
    });
  }

  // ─── DIALOGS & BOTTOM SHEETS ───────────────────────────────────────────────

  // 1. Choose Fields Bottom Sheet (Triggered by "Other" pill)
  void _showChooseFieldsBottomSheet() {
    final fields = [
      'Middle name',
      'Phonetic pronunciation',
      'Prefix',
      'Suffix',
      'Nickname',
      'File as',
      'Job title',
      'Department',
      'Related people',
      'Website',
      'Custom field',
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1F1A17),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 12),
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: const Color(0xFF5A4D46),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    'Choose fields to add',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                ...fields.map((field) {
                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 0),
                    title: Text(
                      field,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                    onTap: () {
                      Navigator.pop(ctx);
                      setState(() {
                        if (!_additionalFields.containsKey(field)) {
                          _additionalFields[field] = TextEditingController();
                        }
                      });
                    },
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  // 2. Birthday / Significant Date Wheel Picker Dialog
  void _showDatePickerDialog() {
    DateTime tempDate = _significantDate;
    bool tempIncludeYear = _includeYear;

    final months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'
    ];

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (dialogContext, setDlgState) {
            String formatHeader(DateTime dt, bool withYear) {
              final monthStr = months[dt.month - 1];
              return withYear ? '${dt.day} $monthStr ${dt.year}' : '${dt.day} $monthStr';
            }

            final dayController = FixedExtentScrollController(initialItem: tempDate.day - 1);
            final monthController = FixedExtentScrollController(initialItem: tempDate.month - 1);
            final yearController = FixedExtentScrollController(initialItem: (tempDate.year - 1920).clamp(0, 115));

            return AlertDialog(
              backgroundColor: const Color(0xFF28231F),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              contentPadding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
              content: SizedBox(
                width: 310,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header Date
                    Text(
                      formatHeader(tempDate, tempIncludeYear),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 20),

                    // 3-Column Scroll Wheel with selection lines
                    Stack(
                      alignment: Alignment.center,
                      children: [
                        // Center selection line indicator
                        Positioned(
                          left: 0,
                          right: 0,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(height: 1.2, color: const Color(0xFF7A685F)),
                              const SizedBox(height: 38),
                              Container(height: 1.2, color: const Color(0xFF7A685F)),
                            ],
                          ),
                        ),
                        // Wheels
                        SizedBox(
                          height: 140,
                          child: Row(
                            children: [
                              // Day Wheel (1..31)
                              Expanded(
                                child: ListWheelScrollView.useDelegate(
                                  controller: dayController,
                                  itemExtent: 40,
                                  physics: const FixedExtentScrollPhysics(),
                                  onSelectedItemChanged: (idx) {
                                    setDlgState(() {
                                      tempDate = DateTime(tempDate.year, tempDate.month, idx + 1);
                                    });
                                  },
                                  childDelegate: ListWheelChildBuilderDelegate(
                                    builder: (context, idx) {
                                      if (idx < 0 || idx >= 31) return null;
                                      final isSelected = idx == tempDate.day - 1;
                                      return Center(
                                        child: Text(
                                          '${idx + 1}',
                                          style: TextStyle(
                                            color: isSelected ? Colors.white : const Color(0xFF8D7F77),
                                            fontSize: isSelected ? 17 : 14,
                                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                          ),
                                        ),
                                      );
                                    },
                                    childCount: 31,
                                  ),
                                ),
                              ),
                              // Month Wheel
                              Expanded(
                                child: ListWheelScrollView.useDelegate(
                                  controller: monthController,
                                  itemExtent: 40,
                                  physics: const FixedExtentScrollPhysics(),
                                  onSelectedItemChanged: (idx) {
                                    setDlgState(() {
                                      tempDate = DateTime(tempDate.year, idx + 1, tempDate.day.clamp(1, 28));
                                    });
                                  },
                                  childDelegate: ListWheelChildBuilderDelegate(
                                    builder: (context, idx) {
                                      if (idx < 0 || idx >= 12) return null;
                                      final isSelected = idx == tempDate.month - 1;
                                      return Center(
                                        child: Text(
                                          months[idx],
                                          style: TextStyle(
                                            color: isSelected ? Colors.white : const Color(0xFF8D7F77),
                                            fontSize: isSelected ? 17 : 14,
                                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                          ),
                                        ),
                                      );
                                    },
                                    childCount: 12,
                                  ),
                                ),
                              ),
                              // Year Wheel (shown if includeYear is true)
                              if (tempIncludeYear)
                                Expanded(
                                  child: ListWheelScrollView.useDelegate(
                                    controller: yearController,
                                    itemExtent: 40,
                                    physics: const FixedExtentScrollPhysics(),
                                    onSelectedItemChanged: (idx) {
                                      setDlgState(() {
                                        tempDate = DateTime(1920 + idx, tempDate.month, tempDate.day);
                                      });
                                    },
                                    childDelegate: ListWheelChildBuilderDelegate(
                                      builder: (context, idx) {
                                        final year = 1920 + idx;
                                        if (year > 2035) return null;
                                        final isSelected = year == tempDate.year;
                                        return Center(
                                          child: Text(
                                            '$year',
                                            style: TextStyle(
                                              color: isSelected ? Colors.white : const Color(0xFF8D7F77),
                                              fontSize: isSelected ? 17 : 14,
                                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                            ),
                                          ),
                                        );
                                      },
                                      childCount: 116,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 18),

                    // Include Year Toggle
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Include year',
                          style: TextStyle(color: Colors.white, fontSize: 14.5),
                        ),
                        Switch(
                          value: tempIncludeYear,
                          activeColor: OctalColors.coralButton,
                          activeTrackColor: OctalColors.coralButton.withOpacity(0.5),
                          inactiveThumbColor: const Color(0xFF8D7F77),
                          inactiveTrackColor: const Color(0xFF3F352F),
                          onChanged: (val) {
                            setDlgState(() {
                              tempIncludeYear = val;
                            });
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel', style: TextStyle(color: OctalColors.coralAccent, fontSize: 14.5)),
                ),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _significantDate = tempDate;
                      _includeYear = tempIncludeYear;
                      _hasSignificantDate = true;
                    });
                    Navigator.pop(ctx);
                  },
                  child: const Text('OK', style: TextStyle(color: OctalColors.coralAccent, fontWeight: FontWeight.bold, fontSize: 14.5)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // 3. Add to Label Modal Dialog
  void _showAddLabelDialog() {
    List<String> tempSelected = List.from(_selectedLabels);

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (dialogContext, setDlgState) {
            return AlertDialog(
              backgroundColor: const Color(0xFF28231F),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              contentPadding: const EdgeInsets.fromLTRB(24, 24, 24, 10),
              title: const Text(
                'Add to label',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
              ),
              content: SizedBox(
                width: 290,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ..._availableLabels.map((lbl) {
                      final isChecked = tempSelected.contains(lbl);
                      return InkWell(
                        onTap: () {
                          setDlgState(() {
                            if (isChecked) {
                              tempSelected.remove(lbl);
                            } else {
                              tempSelected.add(lbl);
                            }
                          });
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8.0),
                          child: Row(
                            children: [
                              const Icon(Icons.label_outline_rounded, color: Colors.white, size: 22),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Text(
                                  lbl,
                                  style: const TextStyle(color: Colors.white, fontSize: 15),
                                ),
                              ),
                              Checkbox(
                                value: isChecked,
                                activeColor: OctalColors.coralButton,
                                checkColor: Colors.black,
                                side: const BorderSide(color: Colors.white, width: 1.5),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                                onChanged: (val) {
                                  setDlgState(() {
                                    if (val == true) {
                                      tempSelected.add(lbl);
                                    } else {
                                      tempSelected.remove(lbl);
                                    }
                                  });
                                },
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 8),
                    InkWell(
                      onTap: () async {
                        final newLbl = await _promptNewName(context, 'New label');
                        if (newLbl != null && newLbl.isNotEmpty) {
                          setState(() {
                            if (!_availableLabels.contains(newLbl)) {
                              _availableLabels.add(newLbl);
                            }
                          });
                          setDlgState(() {
                            tempSelected.add(newLbl);
                          });
                        }
                      },
                      child: const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8.0),
                        child: Row(
                          children: [
                            Icon(Icons.add, color: OctalColors.coralAccent, size: 20),
                            SizedBox(width: 14),
                            Text(
                              'New label',
                              style: TextStyle(
                                color: OctalColors.coralAccent,
                                fontSize: 14.5,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel', style: TextStyle(color: OctalColors.coralAccent, fontSize: 14.5)),
                ),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _selectedLabels.clear();
                      _selectedLabels.addAll(tempSelected);
                    });
                    Navigator.pop(ctx);
                  },
                  child: const Text('OK', style: TextStyle(color: OctalColors.coralAccent, fontWeight: FontWeight.bold, fontSize: 14.5)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<String?> _promptNewName(BuildContext ctx, String title) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: ctx,
      builder: (c) {
        return AlertDialog(
          backgroundColor: const Color(0xFF28231F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 17)),
          content: TextField(
            controller: controller,
            autofocus: true,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              hintText: 'Enter name',
              hintStyle: TextStyle(color: OctalColors.textSecondary),
              enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: OctalColors.coralAccent)),
              focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: OctalColors.coralAccent, width: 2)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, null),
              child: const Text('Cancel', style: TextStyle(color: OctalColors.textSecondary)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(c, controller.text.trim()),
              child: const Text('OK', style: TextStyle(color: OctalColors.coralAccent, fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  // ─── BUILD SCREEN ──────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OctalColors.bgDark,
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar
            _buildAppBar(),

            // Form Content
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
                children: [
                  // Picture and calling card hero
                  _buildPictureAndCallingCard(),

                  const SizedBox(height: 24),

                  // Basic fields: First name, Surname, Company
                  _buildOutlinedTextField(controller: _firstNameController, label: 'First name'),
                  const SizedBox(height: 14),
                  _buildOutlinedTextField(controller: _surnameController, label: 'Surname'),
                  const SizedBox(height: 14),
                  _buildOutlinedTextField(controller: _companyController, label: 'Company'),
                  const SizedBox(height: 14),

                  // Additional Name fields added via "Other"
                  ..._additionalFields.entries.where((e) => [
                    'Middle name', 'Phonetic pronunciation', 'Prefix', 'Suffix', 'Nickname', 'File as'
                  ].contains(e.key)).map((e) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14.0),
                      child: _buildRemovableOutlinedField(
                        controller: e.value,
                        label: e.key,
                        onRemove: () => _removeAdditionalField(e.key),
                      ),
                    );
                  }),

                  // Phone fields
                  ..._phoneControllers.asMap().entries.map((entry) {
                    final idx = entry.key;
                    final ctrl = entry.value;
                    final lbl = _phoneLabels[idx];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14.0),
                      child: _buildPhoneField(ctrl, lbl, idx),
                    );
                  }),

                  // Add phone text button
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: _addPhone,
                      style: TextButton.styleFrom(padding: EdgeInsets.zero),
                      child: const Text(
                        'Add phone',
                        style: TextStyle(
                          color: OctalColors.coralAccent,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),

                  // Dynamic Email fields
                  ..._emailControllers.asMap().entries.map((entry) {
                    final idx = entry.key;
                    final ctrl = entry.value;
                    final lbl = _emailLabels[idx];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14.0),
                      child: _buildEmailField(ctrl, lbl, idx),
                    );
                  }),
                  if (_emailControllers.isNotEmpty)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: _addEmail,
                        style: TextButton.styleFrom(padding: EdgeInsets.zero),
                        child: const Text(
                          'Add email',
                          style: TextStyle(
                            color: OctalColors.coralAccent,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  if (_emailControllers.isNotEmpty) const SizedBox(height: 6),

                  // Dynamic Birthday / Significant date
                  if (_hasSignificantDate) ...[
                    _buildSignificantDateField(),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: _showDatePickerDialog,
                        style: TextButton.styleFrom(padding: EdgeInsets.zero),
                        child: const Text(
                          'Add significant date',
                          style: TextStyle(
                            color: OctalColors.coralAccent,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                  ],

                  // Dynamic Address fields
                  ..._addressControllers.asMap().entries.map((entry) {
                    final idx = entry.key;
                    final ctrl = entry.value;
                    final lbl = _addressLabels[idx];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14.0),
                      child: _buildAddressField(ctrl, lbl, idx),
                    );
                  }),
                  if (_addressControllers.isNotEmpty)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: _addAddress,
                        style: TextButton.styleFrom(padding: EdgeInsets.zero),
                        child: const Text(
                          'Add address',
                          style: TextStyle(
                            color: OctalColors.coralAccent,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  if (_addressControllers.isNotEmpty) const SizedBox(height: 6),

                  // Dynamic Selected Labels
                  if (_selectedLabels.isNotEmpty) ...[
                    _buildLabelsSection(),
                    const SizedBox(height: 14),
                  ],

                  // Additional non-name fields added via "Other"
                  ..._additionalFields.entries.where((e) => ![
                    'Middle name', 'Phonetic pronunciation', 'Prefix', 'Suffix', 'Nickname', 'File as'
                  ].contains(e.key)).map((e) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14.0),
                      child: _buildRemovableOutlinedField(
                        controller: e.value,
                        label: e.key,
                        onRemove: () => _removeAdditionalField(e.key),
                      ),
                    );
                  }),

                  // Notes field
                  _buildOutlinedTextField(
                    controller: _notesController,
                    label: 'Notes',
                    maxLines: 3,
                  ),

                  const SizedBox(height: 28),

                  // Add more info section (dynamic pill buttons)
                  _buildAddMoreInfoSection(),

                  const SizedBox(height: 36),

                  // Footer: Saving to device and Google
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        'Saving to device and Google',
                        style: TextStyle(color: OctalColors.textSecondary, fontSize: 12),
                      ),
                      const SizedBox(width: 8),
                      CircleAvatar(
                        radius: 10,
                        backgroundColor: Colors.pinkAccent.shade200,
                        child: const Text(
                          'M',
                          style: TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.keyboard_arrow_up_rounded, color: OctalColors.textSecondary, size: 18),
                    ],
                  ),

                  const SizedBox(height: 32),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── APP BAR ───────────────────────────────────────────────────────────────

  Widget _buildAppBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.close_rounded, color: Colors.white, size: 24),
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 4),
          const Expanded(
            child: Text(
              'Create contact',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          IconButton(
            icon: Icon(
              _isFavorite ? Icons.star_rounded : Icons.star_outline_rounded,
              color: _isFavorite ? OctalColors.coralAccent : Colors.white,
              size: 24,
            ),
            onPressed: () {
              setState(() {
                _isFavorite = !_isFavorite;
              });
            },
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: _handleSave,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              decoration: BoxDecoration(
                color: OctalColors.coralButton,
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Text(
                'Save',
                style: TextStyle(
                  color: Colors.black,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            icon: const Icon(Icons.more_vert_rounded, color: Colors.white, size: 22),
            onPressed: () {},
          ),
        ],
      ),
    );
  }

  // ─── HERO CALLING CARD ─────────────────────────────────────────────────────

  Widget _buildPictureAndCallingCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: OctalColors.surfaceCard,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Picture and calling card',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.more_vert_rounded, color: OctalColors.textSecondary, size: 18),
                onPressed: () {},
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Avatar Placeholder with '+' badge
              GestureDetector(
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Profile photo customizer')),
                  );
                },
                child: const Stack(
                  alignment: Alignment.topRight,
                  children: [
                    CircleAvatar(
                      radius: 46,
                      backgroundColor: Color(0xFF0D3B75),
                      child: CircleAvatar(
                        radius: 36,
                        backgroundColor: Color(0xFFD48B5E),
                      ),
                    ),
                    Positioned(
                      top: 2,
                      right: 2,
                      child: CircleAvatar(
                        radius: 13,
                        backgroundColor: Color(0xFF5A3E31),
                        child: Icon(Icons.add, size: 16, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 24),
              // Calling card preview with '+' badge
              GestureDetector(
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Calling card visual style picker')),
                  );
                },
                child: Stack(
                  alignment: Alignment.topRight,
                  children: [
                    Container(
                      width: 78,
                      height: 120,
                      decoration: BoxDecoration(
                        color: const Color(0xFF0D3B75),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 44,
                            height: 5,
                            decoration: BoxDecoration(
                              color: const Color(0xFF2C7BE5),
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Icon(Icons.landscape_rounded, color: Color(0xFFD48B5E), size: 36),
                          const SizedBox(height: 14),
                          Container(
                            width: 54,
                            height: 14,
                            decoration: BoxDecoration(
                              color: const Color(0xFF8B4B27),
                              borderRadius: BorderRadius.circular(7),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Positioned(
                      top: -2,
                      right: -2,
                      child: CircleAvatar(
                        radius: 13,
                        backgroundColor: Color(0xFF5A3E31),
                        child: Icon(Icons.add, size: 16, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
        ],
      ),
    );
  }

  // ─── FORM FIELD BUILDERS ───────────────────────────────────────────────────

  Widget _buildOutlinedTextField({
    required TextEditingController controller,
    required String label,
    int maxLines = 1,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: OctalColors.bgDark,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: OctalColors.fieldBorder, width: 1.2),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        style: const TextStyle(color: Colors.white, fontSize: 15),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: const TextStyle(color: OctalColors.textSecondary, fontSize: 14),
          border: InputBorder.none,
        ),
      ),
    );
  }

  Widget _buildRemovableOutlinedField({
    required TextEditingController controller,
    required String label,
    required VoidCallback onRemove,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: OctalColors.bgDark,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: OctalColors.fieldBorder, width: 1.2),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              style: const TextStyle(color: Colors.white, fontSize: 15),
              decoration: InputDecoration(
                labelText: label,
                labelStyle: const TextStyle(color: OctalColors.textSecondary, fontSize: 14),
                border: InputBorder.none,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.remove_circle_outline_rounded, color: OctalColors.coralAccent, size: 20),
            onPressed: onRemove,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  Widget _buildPhoneField(TextEditingController controller, String label, int index) {
    return Container(
      decoration: BoxDecoration(
        color: OctalColors.bgDark,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: OctalColors.fieldBorder, width: 1.2),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          const Text('🇵🇰', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 4),
          const Icon(Icons.arrow_drop_down_rounded, color: OctalColors.textSecondary, size: 20),
          const SizedBox(width: 8),
          const Text('+92', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500)),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: controller,
              keyboardType: TextInputType.phone,
              style: const TextStyle(color: Colors.white, fontSize: 15),
              decoration: InputDecoration(
                labelText: 'Phone ($label)',
                labelStyle: const TextStyle(color: OctalColors.textSecondary, fontSize: 14),
                border: InputBorder.none,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.remove_circle_outline_rounded, color: OctalColors.coralAccent, size: 20),
            onPressed: () => _removePhone(index),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  Widget _buildEmailField(TextEditingController controller, String label, int index) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Email text box
        Container(
          decoration: BoxDecoration(
            color: OctalColors.bgDark,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: OctalColors.coralAccent, width: 1.4),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  keyboardType: TextInputType.emailAddress,
                  style: const TextStyle(color: Colors.white, fontSize: 15),
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    labelStyle: TextStyle(color: OctalColors.coralAccent, fontSize: 14),
                    border: InputBorder.none,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.remove_circle_outline_rounded, color: OctalColors.coralAccent, size: 20),
                onPressed: () => _removeEmail(index),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Label Dropdown Box
        _buildLabelDropdown(
          selectedLabel: label,
          onSelected: (newLabel) {
            setState(() {
              _emailLabels[index] = newLabel;
            });
          },
        ),
      ],
    );
  }

  Widget _buildAddressField(TextEditingController controller, String label, int index) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Address input box
        Container(
          decoration: BoxDecoration(
            color: OctalColors.bgDark,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: OctalColors.coralAccent, width: 1.4),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  maxLines: 2,
                  style: const TextStyle(color: Colors.white, fontSize: 15),
                  decoration: const InputDecoration(
                    labelText: 'Address',
                    labelStyle: TextStyle(color: OctalColors.coralAccent, fontSize: 14),
                    border: InputBorder.none,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.remove_circle_outline_rounded, color: OctalColors.coralAccent, size: 20),
                onPressed: () => _removeAddress(index),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Label Dropdown Box
        _buildLabelDropdown(
          selectedLabel: label,
          onSelected: (newLabel) {
            setState(() {
              _addressLabels[index] = newLabel;
            });
          },
        ),
      ],
    );
  }

  Widget _buildSignificantDateField() {
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    final dateStr = _includeYear
        ? '${_significantDate.day} ${months[_significantDate.month - 1]} ${_significantDate.year}'
        : '${_significantDate.day} ${months[_significantDate.month - 1]}';

    return Container(
      decoration: BoxDecoration(
        color: OctalColors.bgDark,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: OctalColors.fieldBorder, width: 1.2),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.calendar_today_outlined, color: Colors.white, size: 20),
          const SizedBox(width: 14),
          Expanded(
            child: InkWell(
              onTap: _showDatePickerDialog,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8.0),
                child: Text(
                  '$_significantDateType: $dateStr',
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.arrow_drop_down_rounded, color: OctalColors.textSecondary),
            color: const Color(0xFF28231F),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
            onSelected: (val) {
              setState(() {
                _significantDateType = val;
              });
            },
            itemBuilder: (ctx) => ['Birthday', 'Anniversary', 'Other'].map((t) {
              return PopupMenuItem(
                value: t,
                child: Text(t, style: const TextStyle(color: Colors.white, fontSize: 14)),
              );
            }).toList(),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.remove_circle_outline_rounded, color: OctalColors.coralAccent, size: 20),
            onPressed: _removeSignificantDate,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  Widget _buildLabelsSection() {
    return Container(
      decoration: BoxDecoration(
        color: OctalColors.bgDark,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: OctalColors.fieldBorder, width: 1.2),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Labels', style: TextStyle(color: OctalColors.textSecondary, fontSize: 12)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: _selectedLabels.map((lbl) {
              return Chip(
                backgroundColor: const Color(0xFF4A3225),
                label: Text(lbl, style: const TextStyle(color: Colors.white, fontSize: 13)),
                deleteIcon: const Icon(Icons.remove_circle_outline_rounded, color: OctalColors.coralAccent, size: 16),
                onDeleted: () => _removeLabel(lbl),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildLabelDropdown({
    required String selectedLabel,
    required ValueChanged<String> onSelected,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: OctalColors.bgDark,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: OctalColors.fieldBorder, width: 1.2),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: PopupMenuButton<String>(
        color: const Color(0xFF28231F),
        onSelected: onSelected,
        itemBuilder: (ctx) => ['Home', 'Work', 'Other', 'Custom'].map((val) {
          return PopupMenuItem(
            value: val,
            child: Text(val, style: const TextStyle(color: Colors.white, fontSize: 14)),
          );
        }).toList(),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Label', style: TextStyle(color: OctalColors.textSecondary, fontSize: 11)),
                const SizedBox(height: 2),
                Text(selectedLabel, style: const TextStyle(color: Colors.white, fontSize: 14.5)),
              ],
            ),
            const Icon(Icons.arrow_drop_down_rounded, color: OctalColors.textSecondary, size: 22),
          ],
        ),
      ),
    );
  }

  // ─── ADD MORE INFO SECTION ─────────────────────────────────────────────────

  Widget _buildAddMoreInfoSection() {
    // Dynamic list of info buttons based on what hasn't been added yet
    final List<Widget> buttons = [];

    if (_emailControllers.isEmpty) {
      buttons.add(_buildInfoButton(Icons.mail_outline_rounded, 'Email', _addEmail));
    }
    if (!_hasSignificantDate) {
      buttons.add(_buildInfoButton(Icons.cake_outlined, 'Birthday', _showDatePickerDialog));
    }
    if (_addressControllers.isEmpty) {
      buttons.add(_buildInfoButton(Icons.location_on_outlined, 'Address', _addAddress));
    }
    if (_selectedLabels.isEmpty) {
      buttons.add(_buildInfoButton(Icons.label_outline_rounded, 'Labels', _showAddLabelDialog));
    }
    buttons.add(_buildInfoButton(Icons.assignment_outlined, 'Other', _showChooseFieldsBottomSheet));

    // Arrange buttons in 2 columns
    final List<Widget> rows = [];
    for (int i = 0; i < buttons.length; i += 2) {
      final first = buttons[i];
      final second = (i + 1 < buttons.length) ? buttons[i + 1] : null;

      rows.add(
        Row(
          children: [
            Expanded(child: first),
            const SizedBox(width: 12),
            if (second != null) Expanded(child: second) else const Expanded(child: SizedBox()),
          ],
        ),
      );
      if (i + 2 < buttons.length) {
        rows.add(const SizedBox(height: 12));
      }
    }

    return Column(
      children: [
        const Center(
          child: Text(
            'Add more info',
            style: TextStyle(
              color: OctalColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 16),
        ...rows,
      ],
    );
  }

  Widget _buildInfoButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          color: const Color(0xFF4E2618), // Warm dark rust brown from screenshots
          borderRadius: BorderRadius.circular(24),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
