import {useCallback, useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {
  EMPTY,
  FIELD_ORDER,
  firstInvalidField,
  validateAll,
  validateField,
  type Errors,
  type Field,
  type Values,
} from './src/validation';

const LABELS: Record<Field, string> = {
  name: 'Full name',
  email: 'Email',
  password: 'Password',
  confirm: 'Confirm password',
};

export default function App() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  // One ref per field. In 0.87 the ref type is `TextInputInstance` — the old
  // `NativeMethods` / `NativeMethodsMixin` types no longer exist.
  const refs = useRef<Partial<Record<Field, TextInputInstance | null>>>({});

  const setValue = useCallback((field: Field, text: string) => {
    setValues(prev => {
      const next = {...prev, [field]: text};
      // Only clear an existing error while typing. Validating every keystroke
      // shouts at someone halfway through a valid entry.
      setErrors(prevErrors => {
        if (!prevErrors[field]) return prevErrors;
        const message = validateField(field, next);
        if (message) return prevErrors;
        const {[field]: _removed, ...rest} = prevErrors;
        return rest;
      });
      return next;
    });
  }, []);

  const onBlur = useCallback(
    (field: Field) => {
      setTouched(prev => ({...prev, [field]: true}));
      const message = validateField(field, values);
      setErrors(prev => (message ? {...prev, [field]: message} : prev));
    },
    [values],
  );

  const focus = useCallback((field: Field) => {
    refs.current[field]?.focus();
  }, []);

  const onSubmit = useCallback(() => {
    setSubmitted(false);
    const found = validateAll(values);
    setErrors(found);
    setTouched({name: true, email: true, password: true, confirm: true});

    const bad = firstInvalidField(values);
    if (bad) {
      // Focusing the offending field is the difference between a form that
      // tells you something is wrong and one that helps you fix it.
      focus(bad);
      return;
    }
    setSubmitted(true);
  }, [values, focus]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.fill}
          // The platforms genuinely differ. iOS reports the keyboard before it
          // animates in and does not resize the window, so the view must add
          // padding itself. Android resizes the window when the activity uses
          // adjustResize, so 'height' cooperates with that instead of fighting
          // it and double-shifting the layout.
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.content}
            // 'handled' lets a tap on a button work on the first press while
            // still dismissing the keyboard on a tap in empty space. The
            // boolean form of this prop was removed in 0.87.
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <Text style={styles.heading}>Create an account</Text>

            {FIELD_ORDER.map((field, index) => {
              const last = index === FIELD_ORDER.length - 1;
              const error = touched[field] ? errors[field] : undefined;
              const secure = field === 'password' || field === 'confirm';
              return (
                <View key={field} style={styles.field}>
                  <Text style={styles.label} nativeID={`label-${field}`}>
                    {LABELS[field]}
                  </Text>
                  <TextInput
                    ref={instance => {
                      refs.current[field] = instance;
                    }}
                    value={values[field]}
                    onChangeText={text => setValue(field, text)}
                    onBlur={() => onBlur(field)}
                    style={[styles.input, error ? styles.inputError : null]}
                    // Moves focus down the form instead of closing the keyboard.
                    returnKeyType={last ? 'done' : 'next'}
                    onSubmitEditing={() =>
                      last ? onSubmit() : focus(FIELD_ORDER[index + 1])
                    }
                    // submitBehavior replaces the old blurOnSubmit prop.
                    submitBehavior={last ? 'blurAndSubmit' : 'submit'}
                    secureTextEntry={secure}
                    // These three are what make platform autofill work. Without
                    // them the OS cannot offer a saved password.
                    autoComplete={
                      field === 'email'
                        ? 'email'
                        : field === 'name'
                          ? 'name'
                          : field === 'password'
                            ? 'new-password'
                            : 'new-password'
                    }
                    textContentType={
                      field === 'email'
                        ? 'emailAddress'
                        : field === 'name'
                          ? 'name'
                          : 'newPassword'
                    }
                    inputMode={field === 'email' ? 'email' : 'text'}
                    autoCapitalize={field === 'name' ? 'words' : 'none'}
                    autoCorrect={false}
                    accessibilityLabelledBy={`label-${field}`}
                    aria-invalid={error !== undefined}
                  />
                  {error ? (
                    <Text style={styles.error} accessibilityLiveRegion="polite">
                      {error}
                    </Text>
                  ) : null}
                </View>
              );
            })}

            <Pressable
              onPress={onSubmit}
              accessibilityRole="button"
              style={({pressed}) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Create account</Text>
            </Pressable>

            {submitted ? (
              <Text style={styles.ok} accessibilityLiveRegion="polite">
                Valid. In a real app this is where the request would go — over
                HTTPS, with the password never written to storage or a log.
              </Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#ffffff'},
  fill: {flex: 1},
  content: {padding: 20, paddingBottom: 48, gap: 4},
  heading: {fontSize: 24, fontWeight: '700', color: '#12161b', marginBottom: 12},
  field: {marginBottom: 14},
  label: {fontSize: 13, fontWeight: '600', color: '#41505f', marginBottom: 5},
  input: {
    borderWidth: 1,
    borderColor: '#c8ced6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#12161b',
  },
  inputError: {borderColor: '#b3261e'},
  error: {fontSize: 13, color: '#b3261e', marginTop: 5},
  button: {
    marginTop: 8,
    backgroundColor: '#0a58ca',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonPressed: {backgroundColor: '#0846a6'},
  buttonText: {color: '#ffffff', fontSize: 16, fontWeight: '600'},
  ok: {marginTop: 16, fontSize: 14, color: '#0f7048', lineHeight: 20},
});
